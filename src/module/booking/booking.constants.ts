// =====================================================================
// BOOKING - constants (all the "magic values" of the booking module)
// =====================================================================

import type { BookingStatus } from "../../generated/prisma/enums.js";

// ---------------------------------------------------------------
// Booking status flow
//
//   PENDING -> SEARCHING_PROVIDER -> CONFIRMED -> IN_PROGRESS -> COMPLETED
//                     |                  |
//                     |                  +--> CANCELLED (customer or admin)
//                     +--> EXPIRED (nobody accepted in time)
// ---------------------------------------------------------------

// A CUSTOMER can cancel only before the work starts
export const CUSTOMER_CAN_CANCEL: BookingStatus[] = ["PENDING", "SEARCHING_PROVIDER", "CONFIRMED"];

// An ADMIN can also cancel a job that is in progress
export const ADMIN_CAN_CANCEL: BookingStatus[] = [...CUSTOMER_CAN_CANCEL, "IN_PROGRESS"];

// ---------------------------------------------------------------
// Booking requests (one row per provider / agency we asked)
//   SENT      -> we sent the request
//   DELIVERED -> the provider app has downloaded it
// Both mean "still open, they can still accept".
// ---------------------------------------------------------------

export const OPEN_REQUEST_STATUSES = ["SENT", "DELIVERED"] as const;

export const isOpenRequest = (status: string) => (OPEN_REQUEST_STATUSES as readonly string[]).includes(status);

// ---------------------------------------------------------------
// Completion code (the 6-digit code the customer gives the worker)
// ---------------------------------------------------------------

export const COMPLETION_CODE_DIGITS = 6;
export const MAX_COMPLETION_CODES_PER_BOOKING = 5; // how many new codes a customer may ask for
export const MAX_WRONG_CODE_ATTEMPTS = 5; // per code

// How many times we retry if a random booking number already exists
export const BOOKING_NUMBER_RETRIES = 3;
