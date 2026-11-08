import type { CapReason, ExtractedFacts, ScoreBreakdown } from "../schemas/index.js";
import * as R from "./rubric.js";
import { routingFor, tierFor } from "./tier.js";

type Cap = ScoreBreakdown["caps_applied"][number];

function trackRecordPoints(facts: ExtractedFacts): number {
  const years = facts.years_in_business;
  // A new entrant has no history to score, whatever else was said.
  if (facts.is_new_entrant || years === null) return R.TRACK_RECORD_NONE_POINTS;
  if (years >= R.TRACK_RECORD_STRONG_MIN_YEARS) return R.TRACK_RECORD_STRONG_POINTS;
  if (years >= R.TRACK_RECORD_MODERATE_MIN_YEARS) return R.TRACK_RECORD_MODERATE_POINTS;
  return R.TRACK_RECORD_NONE_POINTS;
}

function retailAccountsPoints(accounts: number | null): number {
  if (accounts === null) return 0;
  if (accounts >= R.RETAIL_ACCOUNTS_LARGE_MIN) return R.RETAIL_ACCOUNTS_LARGE_POINTS;
  if (accounts >= R.RETAIL_ACCOUNTS_SMALL_MIN) return R.RETAIL_ACCOUNTS_SMALL_POINTS;
  return 0;
}

function operationalSignalPoints(facts: ExtractedFacts): number {
  const { existing_brands_count: brands } = facts;
  return (
    retailAccountsPoints(facts.retail_accounts) +
    (brands !== null && brands >= R.EXISTING_BRANDS_MIN ? R.EXISTING_BRANDS_POINTS : 0) +
    (facts.named_market !== null ? R.NAMED_MARKET_POINTS : 0) +
    (facts.trade_fluency ? R.TRADE_FLUENCY_POINTS : 0)
  );
}

function volumePoints(monthlyFcl: number | null): number {
  // Unknown volume earns nothing but is not penalised: only stated sub-FCL volume is capped.
  if (monthlyFcl === null) return R.VOLUME_NONE_POINTS;
  if (monthlyFcl >= R.VOLUME_HIGH_MIN_FCL) return R.VOLUME_HIGH_POINTS;
  if (monthlyFcl >= R.VOLUME_FCL_THRESHOLD) return R.VOLUME_STANDARD_POINTS;
  return R.VOLUME_NONE_POINTS;
}

/** Every cap whose trigger holds, even if a lower cap makes it redundant. */
function triggeredCaps(facts: ExtractedFacts): Cap[] {
  const triggers: Record<CapReason, { fires: boolean; max: number }> = {
    legitimacy_red_flag: { fires: facts.red_flags.length > 0, max: R.CLEAR_NEGATIVE_CAP },
    personal_use: {
      fires: facts.personal_use || facts.business_type === "consumer",
      max: R.CLEAR_NEGATIVE_CAP,
    },
    non_beverage: { fires: facts.product_request === "non_beverage", max: R.CLEAR_NEGATIVE_CAP },
    sub_fcl_volume: {
      fires: facts.monthly_fcl !== null && facts.monthly_fcl < R.VOLUME_FCL_THRESHOLD,
      max: R.CLEAR_NEGATIVE_CAP,
    },
    injection_attempt: { fires: facts.injection_attempt, max: R.INJECTION_CAP },
  };
  return R.CAP_PRIORITY.filter((reason) => triggers[reason].fires).map((reason) => ({
    reason,
    max_score: triggers[reason].max,
  }));
}

function clamp(value: number): number {
  return Math.min(R.SCORE_MAX, Math.max(R.SCORE_MIN, value));
}

export function scoreFacts(facts: ExtractedFacts): ScoreBreakdown {
  const businessType = R.BUSINESS_TYPE_POINTS[facts.business_type];
  const trackRecord = trackRecordPoints(facts);
  const operationalSignals = operationalSignalPoints(facts);
  const legitimacyTotal = businessType + trackRecord + operationalSignals;

  const license = R.LICENSE_POINTS[facts.license_status];
  const volume = volumePoints(facts.monthly_fcl);
  const productFit = R.PRODUCT_FIT_POINTS[facts.product_request];
  const rawTotal = legitimacyTotal + license + volume + productFit;

  const caps = triggeredCaps(facts);
  const finalScore = clamp(Math.round(Math.min(rawTotal, ...caps.map((c) => c.max_score))));
  const tier = tierFor(finalScore);

  return {
    legitimacy: {
      business_type: businessType,
      track_record: trackRecord,
      operational_signals: operationalSignals,
      total: legitimacyTotal,
    },
    license,
    volume,
    product_fit: productFit,
    raw_total: rawTotal,
    caps_applied: caps,
    final_score: finalScore,
    tier,
    routing: routingFor(tier),
  };
}
