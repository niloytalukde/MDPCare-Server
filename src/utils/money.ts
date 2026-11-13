import { Prisma } from "../generated/prisma/client.js";

/**
 * All money math goes through Prisma.Decimal (decimal.js) - never JS floats (FIN-01).
 * Values are rounded to 2 dp (paise) half-up, matching DECIMAL(12,2)/(14,2) columns.
 */
export type Money = Prisma.Decimal;

export const money = (v: Prisma.Decimal | number | string): Money =>
    new Prisma.Decimal(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/**
 * Service.price is still DOUBLE PRECISION (DB-01, pending approval). Converting
 * via toString() avoids binary artefacts (e.g. 0.1+0.2) before rounding.
 */
export const fromFloat = (v: number): Money => money(v.toString());

export const ZERO = money(0);

export const sum = (values: Money[]): Money => values.reduce((a, b) => a.plus(b), ZERO);
