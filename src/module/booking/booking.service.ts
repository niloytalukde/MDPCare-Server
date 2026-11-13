// =====================================================================
// BOOKING SERVICE - index of everything the booking module can do
//
// The real code is split into small files, one per step.
// Other modules (agency, admin) import from here.
// =====================================================================

// Step 1 - customer creates a booking
export { createBooking, type CreateBookingInput } from "./booking-create.service.js";

// Step 2 - search rounds (find nearby providers / agencies)
export { openSearchRound, isLastRound } from "./booking-matching.service.js";

// Step 3 - accept / reject
export {
    providerAccept,
    providerReject,
    providerRequests,
    markProviderRequestsDelivered,
    agencyAccept,
    agencyReject,
    agencyRequests,
} from "./booking-accept.service.js";

// Step 4 - start, completion code, complete
export { startService, issueCompletionOtp, completeService, type Performer } from "./booking-work.service.js";

// Cancel
export { cancelBooking, type CancelledBy } from "./booking-cancel.service.js";

// View
export { getBookingForUser, listCustomerBookings, listProviderBookings } from "./booking-view.service.js";
