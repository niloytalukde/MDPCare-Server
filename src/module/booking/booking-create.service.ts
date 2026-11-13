// =====================================================================
// STEP 1 - CUSTOMER CREATES A BOOKING
//
// What happens:
//   1. Check everything the customer sent (services, address, family member)
//   2. Work out the price (booking-price.ts)
//   3. In ONE transaction:
//        - save the booking + items          (status PENDING)
//        - start search round 1              (booking-matching.service.ts)
//        - change status to SEARCHING_PROVIDER
//   4. Tell nearby providers / agencies (live notification)
// =====================================================================

import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { Prisma } from "../../generated/prisma/client.js";
import { BOOKING_NUMBER_RETRIES } from "./booking.constants.js";
import { saveStatusChange } from "./booking-history.js";
import { calculateBookingPrice } from "./booking-price.js";
import { openSearchRound } from "./booking-matching.service.js";
import { getBookingForUser } from "./booking-view.service.js";
import { notify } from "./booking.notify.js";

export interface CreateBookingInput {
    type: "INSTANT" | "SCHEDULED";
    scheduledAt?: Date | undefined;
    items: { serviceId: number; quantity: number }[];
    addressId?: number | undefined; // a saved address, OR ...
    latitude?: number | undefined; // ... a location typed in now
    longitude?: number | undefined;
    fullAddress?: string | undefined;
    landmark?: string | undefined;
    familyMemberId?: number | undefined; // booking for a family member
    paymentMethod: "ONLINE" | "CASH";
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

// e.g. "MDP20261113A1B2C3D4"  (date + 8 random letters/digits)
const makeBookingNumber = () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    const random = crypto.randomBytes(4).toString("hex").toUpperCase();
    return `MDP${year}${month}${day}${random}`;
};

// Turn a saved Address row into one line of text
const addressToText = (address: {
    flatNo: string | null;
    floor: string | null;
    buildingName: string | null;
    street: string | null;
    area: string | null;
    city: string;
    state: string;
    pincode: string;
}) => {
    const parts = [
        address.flatNo,
        address.floor && `Floor ${address.floor}`,
        address.buildingName,
        address.street,
        address.area,
        address.city,
        address.state,
        address.pincode,
    ];
    return parts.filter(Boolean).join(", ");
};

// True if Prisma says "this booking number already exists"
const isDuplicateBookingNumber = (error: unknown) => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== "P2002") return false; // P2002 = unique value already used
    const target = String((error.meta as { target?: unknown })?.target ?? "");
    return target.includes("bookingNumber");
};

// ---------------------------------------------------------------
// Create a booking
// ---------------------------------------------------------------

export const createBooking = async (userId: number, input: CreateBookingInput) => {
    // ---- 1a. services ----
    const serviceIds = input.items.map((item) => item.serviceId);

    const hasDuplicates = new Set(serviceIds).size !== serviceIds.length;
    if (hasDuplicates) {
        throw new AppError(400, "Each service may appear only once; use quantity instead");
    }

    const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } });
    if (services.length !== serviceIds.length) {
        throw new AppError(404, "One or more services were not found");
    }

    // ---- 1b. address (a saved address must belong to this customer) ----
    let latitude = input.latitude;
    let longitude = input.longitude;
    let fullAddress = input.fullAddress;
    let addressLabel: string | null = null;

    if (input.addressId !== undefined) {
        const address = await prisma.address.findFirst({ where: { id: input.addressId, userId } });
        if (!address) {
            throw new AppError(404, "Address not found");
        }
        latitude = latitude ?? address.latitude ?? undefined;
        longitude = longitude ?? address.longitude ?? undefined;
        fullAddress = fullAddress ?? addressToText(address);
        addressLabel = address.addressType; // HOME / WORK / OTHER
    }

    if (latitude === undefined || longitude === undefined || !fullAddress) {
        throw new AppError(400, "A location (latitude, longitude) and address are required");
    }

    // ---- 1c. family member (must belong to this customer) ----
    let customerName: string | null = null;
    let customerPhone: string | null = null;

    if (input.familyMemberId !== undefined) {
        const member = await prisma.familyMember.findFirst({ where: { id: input.familyMemberId, userId } });
        if (!member) {
            throw new AppError(404, "Family member not found");
        }
        customerName = member.name;
        customerPhone = member.phone;
    }

    // ---- 1d. scheduled time must be in the future ----
    if (input.type === "SCHEDULED") {
        if (!input.scheduledAt || input.scheduledAt.getTime() <= Date.now()) {
            throw new AppError(400, "scheduledAt must be in the future for scheduled bookings");
        }
    }

    // ---- 2. price ----
    const price = calculateBookingPrice(services, input.items);

    // ---- 3. save + start searching (retry if the random booking number is taken) ----
    for (let attempt = 1; attempt <= BOOKING_NUMBER_RETRIES; attempt++) {
        try {
            const { booking, searchRound } = await prisma.$transaction(async (tx) => {
                // 3a. save the booking with its items
                const booking = await tx.booking.create({
                    data: {
                        bookingNumber: makeBookingNumber(),
                        userId,
                        type: input.type,
                        status: "PENDING",
                        scheduledAt: input.type === "SCHEDULED" ? (input.scheduledAt as Date) : null,

                        // where (copied, so later address edits don't change this booking)
                        addressId: input.addressId ?? null,
                        addressLabel,
                        fullAddress,
                        latitude: new Prisma.Decimal(latitude).toDecimalPlaces(7),
                        longitude: new Prisma.Decimal(longitude).toDecimalPlaces(7),
                        landmark: input.landmark ?? null,

                        // for whom
                        familyMemberId: input.familyMemberId ?? null,
                        customerName,
                        customerPhone,

                        // price (copied)
                        estimatedDuration: price.estimatedDuration,
                        subtotal: price.subtotal,
                        discountAmount: price.discountAmount,
                        taxAmount: price.taxAmount,
                        platformFee: price.platformFee,
                        totalAmount: price.totalAmount,

                        // payment
                        paymentMethod: input.paymentMethod,
                        paymentStatus: "PENDING",

                        items: { create: price.bookingItems },
                    },
                });
                await saveStatusChange(tx, booking.id, "PENDING", { userId, role: "CUSTOMER" }, "Booking created");

                // 3b. start search round 1 (finds and saves nearby providers / agencies)
                const searchRound = await openSearchRound(
                    tx,
                    {
                        id: booking.id,
                        userId,
                        latitude: booking.latitude,
                        longitude: booking.longitude,
                        serviceIds,
                    },
                    1
                );

                // 3c. now we are searching
                await tx.booking.update({ where: { id: booking.id }, data: { status: "SEARCHING_PROVIDER" } });
                await saveStatusChange(tx, booking.id, "SEARCHING_PROVIDER", { role: "SYSTEM" }, "Broadcast round 1");

                return { booking, searchRound };
            });

            // ---- 4. tell the providers / agencies we found (after saving) ----
            notify.newRequests(booking.id, searchRound);

            return getBookingForUser(booking.id, { userId, isAdmin: false });
        } catch (error) {
            if (isDuplicateBookingNumber(error)) {
                continue; // very rare: try again with a new random number
            }
            throw error;
        }
    }

    throw new AppError(503, "Could not allocate a booking number. Please retry.");
};
