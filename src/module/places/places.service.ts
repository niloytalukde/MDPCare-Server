// =====================================================================
// PLACES - talks to Google Maps for the app
//
// The app never calls Google directly (the key would be inside the app
// and anyone could copy it). Instead:
//
//   App ──► our server /api/v1/places/... ──► Google ──► our server ──► App
//
// Three things:
//   1. searchPlaces     user types "park str"  -> list of suggestions
//   2. getPlaceDetails  user taps a suggestion -> exact GPS + address
//   3. addressFromGps   map pin / current location -> address
//
// Google APIs used (enable them in Google Cloud for the SERVER key):
//   - Places API (New):  Autocomplete + Place Details
//   - Geocoding API:     reverse geocoding (GPS -> address)
// =====================================================================

import { AppError } from "../../errors/AppError.js";
import { env } from "../../config/env.js";
import { parseAddress, type AddressPiece } from "./places.address.js";

const SEARCH_RADIUS_METERS = 50000; // prefer results within 50 km of the user
const GOOGLE_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const getApiKey = () => {
    if (!env.GOOGLE_MAPS_API_KEY) {
        throw new AppError(503, "Location search is not available right now");
    }
    return env.GOOGLE_MAPS_API_KEY;
};

// Call Google and return the JSON. Any Google problem becomes a clean 502
// for the app (the real reason is only written to the server log).
const callGoogle = async (url: string, options: RequestInit = {}) => {
    let response: Response;
    try {
        response = await fetch(url, { ...options, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
    } catch (error) {
        console.error("[places] Google request failed:", (error as Error).message);
        throw new AppError(502, "Location service is not responding. Please try again.");
    }

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
        console.error(`[places] Google answered ${response.status}:`, JSON.stringify(body).slice(0, 500));
        throw new AppError(502, "Location service error. Please try again.");
    }
    return body;
};

// ---------------------------------------------------------------
// 1. Search: "park str" -> suggestions
// ---------------------------------------------------------------

interface GoogleAutocompleteResponse {
    suggestions?: {
        placePrediction?: {
            placeId: string;
            text?: { text: string };
            structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
        };
    }[];
}

export const searchPlaces = async (input: {
    text: string;
    sessionToken: string;
    latitude?: number | undefined;
    longitude?: number | undefined;
}) => {
    const apiKey = getApiKey();

    const requestBody: Record<string, unknown> = {
        input: input.text,
        sessionToken: input.sessionToken,
        includedRegionCodes: ["in"], // India only
        languageCode: "en",
    };

    // Prefer results near the user, if we know where they are
    if (input.latitude !== undefined && input.longitude !== undefined) {
        requestBody.locationBias = {
            circle: {
                center: { latitude: input.latitude, longitude: input.longitude },
                radius: SEARCH_RADIUS_METERS,
            },
        };
    }

    const body = (await callGoogle(`${env.GOOGLE_PLACES_API_URL}/places:autocomplete`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            // only ask Google for the fields we use (cheaper and faster)
            "X-Goog-FieldMask":
                "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
        },
        body: JSON.stringify(requestBody),
    })) as GoogleAutocompleteResponse;

    const suggestions = body.suggestions ?? [];

    return suggestions
        .filter((suggestion) => suggestion.placePrediction?.placeId)
        .map((suggestion) => {
            const prediction = suggestion.placePrediction!;
            return {
                placeId: prediction.placeId,
                title: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "",
                subtitle: prediction.structuredFormat?.secondaryText?.text ?? "",
            };
        });
};

// ---------------------------------------------------------------
// 2. Place details: suggestion -> exact GPS + address
// ---------------------------------------------------------------

interface GooglePlaceDetails {
    location?: { latitude: number; longitude: number };
    formattedAddress?: string;
    addressComponents?: AddressPiece[];
    displayName?: { text: string };
}

export const getPlaceDetails = async (placeId: string, sessionToken: string) => {
    const apiKey = getApiKey();

    const url = `${env.GOOGLE_PLACES_API_URL}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en`;

    const place = (await callGoogle(url, {
        headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "location,formattedAddress,addressComponents,displayName",
        },
    })) as GooglePlaceDetails;

    if (!place.location) {
        throw new AppError(404, "Place not found");
    }

    return {
        placeId,
        name: place.displayName?.text ?? null,
        latitude: place.location.latitude,
        longitude: place.location.longitude,
        ...parseAddress(place.formattedAddress ?? "", place.addressComponents ?? []),
    };
};

// ---------------------------------------------------------------
// 3. GPS -> address (for the map pin and "use current location")
// ---------------------------------------------------------------

interface GoogleGeocodeResponse {
    status: string; // "OK", "ZERO_RESULTS", "REQUEST_DENIED", ...
    error_message?: string;
    results?: { formatted_address: string; address_components: AddressPiece[] }[];
}

export const addressFromGps = async (latitude: number, longitude: number) => {
    const apiKey = getApiKey();

    const url =
        `${env.GOOGLE_GEOCODING_API_URL}?latlng=${latitude},${longitude}` +
        `&language=en&key=${encodeURIComponent(apiKey)}`;

    const body = (await callGoogle(url)) as unknown as GoogleGeocodeResponse;

    // Nothing at this spot (e.g. the middle of the sea)
    if (body.status === "ZERO_RESULTS" || !body.results?.length) {
        return { latitude, longitude, found: false as const, ...parseAddress("", []) };
    }

    if (body.status !== "OK") {
        console.error("[places] Geocoding status:", body.status, body.error_message ?? "");
        throw new AppError(502, "Location service error. Please try again.");
    }

    const best = body.results[0]!;
    return {
        latitude,
        longitude,
        found: true as const,
        ...parseAddress(best.formatted_address, best.address_components),
    };
};
