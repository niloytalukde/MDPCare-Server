// =====================================================================
// BOOKING PRICE - work out the price of a booking
//
// Plain maths, no database. The result is COPIED into the booking
// (BookingItem + Booking totals), so if the admin changes a price
// later, old bookings keep the price the customer saw.
//
// IMPORTANT: money is never calculated with normal JavaScript numbers
// (0.1 + 0.2 = 0.30000000000000004!). We use Decimal via utils/money.ts.
// =====================================================================

import { fromFloat, money, sum, ZERO } from "../../utils/money.js";

// The service fields we need (from the Service table)
export interface ServiceForPrice {
    id: number;
    name: string;
    imageUrl: string | null;
    price: number; // normal price set by the admin
    discountPrice: number | null; // sale price, if any
    timeRequired: number | null; // minutes for 1 unit
}

export interface BookingItemRequest {
    serviceId: number;
    quantity: number;
}

export const calculateBookingPrice = (services: ServiceForPrice[], items: BookingItemRequest[]) => {
    const serviceById = new Map(services.map((service) => [service.id, service]));

    // ---- 1. one line per booked service ----
    const lines = items.map((item) => {
        const service = serviceById.get(item.serviceId)!;

        const normalPrice = fromFloat(service.price);
        const hasDiscount = service.discountPrice !== null;
        const pricePaid = hasDiscount ? fromFloat(service.discountPrice as number) : normalPrice;

        return {
            serviceId: service.id,
            serviceName: service.name,
            serviceImage: service.imageUrl,
            quantity: item.quantity,
            unitPrice: normalPrice,
            discountPrice: hasDiscount ? pricePaid : null,
            totalPrice: money(pricePaid.times(item.quantity)), // what the customer pays for this line
            priceBeforeDiscount: money(normalPrice.times(item.quantity)),
            durationMinutes: service.timeRequired !== null ? service.timeRequired * item.quantity : null,
        };
    });

    // ---- 2. totals ----
    const subtotal = sum(lines.map((line) => line.priceBeforeDiscount));
    const amountAfterDiscount = sum(lines.map((line) => line.totalPrice));
    const discountAmount = money(subtotal.minus(amountAfterDiscount));

    // Commission and tax rules are not decided yet (business decision), so 0 for now.
    // Settlement reads these saved values, so changing the rule later is easy.
    const taxAmount = ZERO;
    const platformFee = ZERO;

    const totalAmount = money(subtotal.minus(discountAmount).plus(taxAmount).plus(platformFee));

    // ---- 3. estimated time (only if every service has a time) ----
    const everyLineHasTime = lines.every((line) => line.durationMinutes !== null);
    const estimatedDuration = everyLineHasTime
        ? lines.reduce((total, line) => total + (line.durationMinutes as number), 0)
        : null;

    // Data for BookingItem rows (without our helper field)
    const bookingItems = lines.map(({ priceBeforeDiscount: _unused, ...line }) => line);

    return { bookingItems, subtotal, discountAmount, taxAmount, platformFee, totalAmount, estimatedDuration };
};
