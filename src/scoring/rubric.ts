import type { BusinessType, CapReason, LicenseStatus, ProductRequest } from "../schemas/index.js";

/**
 * Every scoring number lives here. Other scoring modules import these names
 * and contain no numeric literals of their own.
 */

// --- D13: points (max 100) -------------------------------------------------

export const BUSINESS_TYPE_POINTS: Record<BusinessType, number> = {
  distributor_importer_wholesaler: 15,
  retailer: 8,
  other_business: 8,
  consumer: 0,
  unknown: 0,
};

export const TRACK_RECORD_STRONG_MIN_YEARS = 5;
export const TRACK_RECORD_STRONG_POINTS = 15;
export const TRACK_RECORD_MODERATE_MIN_YEARS = 2;
export const TRACK_RECORD_MODERATE_POINTS = 10;
export const TRACK_RECORD_NONE_POINTS = 0;

export const RETAIL_ACCOUNTS_LARGE_MIN = 50;
export const RETAIL_ACCOUNTS_LARGE_POINTS = 8;
export const RETAIL_ACCOUNTS_SMALL_MIN = 1;
export const RETAIL_ACCOUNTS_SMALL_POINTS = 4;
export const EXISTING_BRANDS_MIN = 1;
export const EXISTING_BRANDS_POINTS = 4;
export const NAMED_MARKET_POINTS = 4;
export const TRADE_FLUENCY_POINTS = 4;

export const LICENSE_POINTS: Record<LicenseStatus, number> = {
  confirmed: 20,
  implied: 16,
  pending: 10,
  none: 0,
  unknown: 0,
};

export const VOLUME_HIGH_MIN_FCL = 3;
export const VOLUME_HIGH_POINTS = 20;
/** One full container load per month: the minimum a distributor deal makes sense at. */
export const VOLUME_FCL_THRESHOLD = 1;
export const VOLUME_STANDARD_POINTS = 15;
export const VOLUME_NONE_POINTS = 0;

export const PRODUCT_FIT_POINTS: Record<ProductRequest, number> = {
  specific_beverage_brand: 10,
  beverage_category: 7,
  unclear: 0,
  non_beverage: 0,
};

// --- D14 / D15: caps (clear negatives) ------------------------------------

export const CLEAR_NEGATIVE_CAP = 15;
/** D15: suspected prompt injection can never reach Hot. */
export const INJECTION_CAP = 69;

// --- D5: tiers and routing -------------------------------------------------

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;
export const HOT_MIN_SCORE = 70;
export const WARM_MIN_SCORE = 25;

// --- D6: degraded mode -----------------------------------------------------

/** Warm floor: an LLM outage must never archive a lead. */
export const DEGRADED_SCORE = 25;
export const DEGRADED_REASONING =
  "Automated analysis unavailable; held in nurture pool at minimum Warm score pending review rather than archived.";

// --- D19: reasoning text limits --------------------------------------------

export const REASONING_MAX_CHARS = 300;
export const REASONING_MAX_BRANDS = 2;
export const REASONING_MAX_FACT_CHARS = 40;
export const NO_LEAD_EVIDENCE_REASONING = "No messages from the lead to assess.";

/** Cap priority when several apply: the first match is explained in the reasoning. */
export const CAP_PRIORITY: readonly CapReason[] = [
  "legitimacy_red_flag",
  "personal_use",
  "non_beverage",
  "sub_fcl_volume",
  "injection_attempt",
];
