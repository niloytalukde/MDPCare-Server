import type { Prisma } from "../../generated/prisma/client.js";
import type { PaymentStatus } from "../../generated/prisma/enums.js";
import { money, ZERO, type Money } from "../../utils/money.js";

type Tx = Prisma.TransactionClient;

/**
 * Booking settlement (FIN-02).
 *
 * Wallet convention: `balance` = what the platform owes the provider/agency.
 * A negative balance means the provider/agency owes the platform (e.g. commission
 * on cash jobs).
 *
 *   commission = booking.platformFee + booking.taxAmount   (snapshot on the booking)
 *   earning    = booking.totalAmount - commission
 *
 *   CASH          provider already collected totalAmount in cash
 *                 -> DEBIT PLATFORM_COMMISSION `commission` from balance
 *   ONLINE + PAID platform holds the money
 *                 -> CREDIT BOOKING_PAYMENT `earning` to pendingBalance (held, see Q2)
 *   ONLINE unpaid nothing posted; call `settleBooking` again once payment is captured
 *
 * The formula and hold policy are business decisions Q1/Q2 in the audit report.
 *
 * Idempotency, in order of defence:
 *   1. Callers run this inside the same transaction as the conditional
 *      IN_PROGRESS -> COMPLETED update, so it can only run once per booking.
 *   2. A pre-check on the deterministic referenceId `booking:{id}:settlement`.
 *   3. The UNIQUE index on referenceId.
 * Wallet rows are locked with SELECT ... FOR UPDATE so balanceBefore/After are exact.
 */

export interface SettlementBooking {
    id: number;
    providerId: number | null;
    agencyId: number | null;
    paymentMethod: "ONLINE" | "CASH" | null;
    paymentStatus: PaymentStatus;
    totalAmount: Prisma.Decimal;
    platformFee: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
}

export type SettlementResult =
    | { status: "SETTLED"; walletKind: "PROVIDER" | "AGENCY"; walletId: number; earning: string; commission: string; entry: "DEBIT_COMMISSION" | "CREDIT_EARNING" | "NONE" }
    | { status: "ALREADY_SETTLED" }
    | { status: "SKIPPED"; reason: string };

export const settlementReference = (bookingId: number) => `booking:${bookingId}:settlement`;

export const computeSettlement = (b: Pick<SettlementBooking, "totalAmount" | "platformFee" | "taxAmount">) => {
    const commission = money(b.platformFee).plus(money(b.taxAmount));
    const earning = money(b.totalAmount).minus(commission);
    return { commission: money(commission), earning: money(earning) };
};

interface WalletRow {
    id: number;
    balance: Prisma.Decimal;
    pendingBalance: Prisma.Decimal;
}

const lockProviderWallet = async (tx: Tx, providerId: number): Promise<WalletRow> => {
    await tx.providerWallet.upsert({ where: { providerId }, update: {}, create: { providerId } });
    const rows = await tx.$queryRaw<WalletRow[]>`
        SELECT id, balance, "pendingBalance" FROM "ProviderWallet" WHERE "providerId" = ${providerId} FOR UPDATE`;
    return rows[0] as WalletRow;
};

const lockAgencyWallet = async (tx: Tx, agencyId: number): Promise<WalletRow> => {
    await tx.agencyWallet.upsert({ where: { agencyId }, update: {}, create: { agencyId } });
    const rows = await tx.$queryRaw<WalletRow[]>`
        SELECT id, balance, "pendingBalance" FROM "AgencyWallet" WHERE "agencyId" = ${agencyId} FOR UPDATE`;
    return rows[0] as WalletRow;
};

export const settleBooking = async (tx: Tx, booking: SettlementBooking): Promise<SettlementResult> => {
    const referenceId = settlementReference(booking.id);

    if (booking.providerId === null && booking.agencyId === null) {
        return { status: "SKIPPED", reason: "Booking has no provider or agency" };
    }

    if (booking.paymentMethod === null) {
        return { status: "SKIPPED", reason: "Booking has no payment method" };
    }

    if (booking.paymentMethod === "ONLINE" && booking.paymentStatus !== "PAID") {
        return { status: "SKIPPED", reason: "Online payment not captured yet" };
    }

    const isAgency = booking.agencyId !== null;

    const already = isAgency
        ? await tx.agencyWalletTransaction.findUnique({ where: { referenceId }, select: { id: true } })
        : await tx.walletTransaction.findUnique({ where: { referenceId }, select: { id: true } });
    if (already) return { status: "ALREADY_SETTLED" };

    const { commission, earning } = computeSettlement(booking);

    const wallet = isAgency
        ? await lockAgencyWallet(tx, booking.agencyId as number)
        : await lockProviderWallet(tx, booking.providerId as number);

    const balanceBefore = money(wallet.balance);
    let entry: "DEBIT_COMMISSION" | "CREDIT_EARNING" | "NONE" = "NONE";

    let txData: {
        type: "CREDIT" | "DEBIT";
        reason: "BOOKING_PAYMENT" | "PLATFORM_COMMISSION";
        amount: Money;
        balanceAfter: Money;
        description: string;
    };
    let walletUpdate: Record<string, unknown>;

    if (booking.paymentMethod === "CASH") {
        // Always write one ledger row (even if commission = 0) so the settlement is recorded exactly once
        entry = commission.greaterThan(ZERO) ? "DEBIT_COMMISSION" : "NONE";
        const balanceAfter = money(balanceBefore.minus(commission));
        txData = {
            type: "DEBIT",
            reason: "PLATFORM_COMMISSION",
            amount: commission,
            balanceAfter,
            description: `Platform commission on cash booking #${booking.id} (earning ${earning.toFixed(2)} collected in cash)`,
        };
        walletUpdate = { balance: balanceAfter, totalEarnings: { increment: earning } };
    } else {
        entry = "CREDIT_EARNING";
        txData = {
            type: "CREDIT",
            reason: "BOOKING_PAYMENT",
            amount: earning,
            balanceAfter: balanceBefore, // credited to pendingBalance, available balance unchanged
            description: `Earning for online booking #${booking.id} (held in pending balance)`,
        };
        walletUpdate = {
            pendingBalance: money(money(wallet.pendingBalance).plus(earning)),
            totalEarnings: { increment: earning },
        };
    }

    const ledger = {
        walletId: wallet.id,
        type: txData.type,
        reason: txData.reason,
        status: "COMPLETED" as const,
        amount: txData.amount,
        balanceBefore,
        balanceAfter: txData.balanceAfter,
        bookingId: booking.id,
        referenceId,
        description: txData.description,
    };

    if (isAgency) {
        await tx.agencyWalletTransaction.create({ data: ledger });
        await tx.agencyWallet.update({ where: { id: wallet.id }, data: walletUpdate });
    } else {
        await tx.walletTransaction.create({ data: ledger });
        await tx.providerWallet.update({ where: { id: wallet.id }, data: walletUpdate });
    }

    return {
        status: "SETTLED",
        walletKind: isAgency ? "AGENCY" : "PROVIDER",
        walletId: wallet.id,
        earning: earning.toFixed(2),
        commission: commission.toFixed(2),
        entry,
    };
};
