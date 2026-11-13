// =====================================================================
// PLACES - turn Google's address pieces into OUR address fields
//
// Google returns an address as a list of pieces, each with "types":
//   { longText: "700016", types: ["postal_code"] }
//   { longText: "Kolkata", types: ["locality", "political"] }
//   ...
// We pick out the ones our Address table needs:
//   area, street, city, state, pincode
// =====================================================================

// One address piece. Places API (New) uses longText/shortText,
// the Geocoding API uses long_name/short_name - we accept both.
export interface AddressPiece {
    longText?: string;
    long_name?: string;
    types: string[];
}

export interface ParsedAddress {
    formattedAddress: string;
    area: string | null; // e.g. "Park Street" area / neighbourhood
    street: string | null; // e.g. "12, Park Street"
    city: string | null; // e.g. "Kolkata"
    state: string | null; // e.g. "West Bengal"
    pincode: string | null; // e.g. "700016"
    country: string | null; // e.g. "India"
}

const textOf = (piece: AddressPiece | undefined) => piece?.longText ?? piece?.long_name ?? null;

// The first piece that has ANY of these types (in order of preference)
const findPiece = (pieces: AddressPiece[], typesInOrder: string[]) => {
    for (const type of typesInOrder) {
        const piece = pieces.find((p) => p.types.includes(type));
        if (piece) return textOf(piece);
    }
    return null;
};

export const parseAddress = (formattedAddress: string, pieces: AddressPiece[]): ParsedAddress => {
    const houseNumber = findPiece(pieces, ["street_number", "premise"]);
    const road = findPiece(pieces, ["route"]);

    return {
        formattedAddress,
        area: findPiece(pieces, ["sublocality_level_1", "sublocality", "neighborhood", "sublocality_level_2"]),
        street: [houseNumber, road].filter(Boolean).join(", ") || null,
        city: findPiece(pieces, ["locality", "administrative_area_level_3", "administrative_area_level_2"]),
        state: findPiece(pieces, ["administrative_area_level_1"]),
        pincode: findPiece(pieces, ["postal_code"]),
        country: findPiece(pieces, ["country"]),
    };
};
