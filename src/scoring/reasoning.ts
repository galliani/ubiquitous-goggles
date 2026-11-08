import type { CapReason, ExtractedFacts, ScoreBreakdown, ScoringMode } from "../schemas/index.js";
import {
  CAP_PRIORITY,
  DEGRADED_REASONING,
  NO_LEAD_EVIDENCE_REASONING,
  REASONING_MAX_BRANDS,
  REASONING_MAX_CHARS,
  REASONING_MAX_FACT_CHARS,
  VOLUME_FCL_THRESHOLD,
} from "./rubric.js";

/**
 * Fact strings originate from the lead's text. Keep only letters, digits, spaces
 * and a few name punctuation marks so a crafted brand cannot add sentences
 * or markup. The LLM layer sanitises too; this is the last line of defence.
 */
function sanitiseFact(raw: string): string {
  return raw
    .replace(/\s+/gu, " ")
    .replace(/[^\p{L}\p{N} \-&']/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, REASONING_MAX_FACT_CHARS)
    .trim();
}

function formatCount(value: number): string {
  return String(Math.round(value));
}

function formatFcl(value: number): string {
  return String(Number(value.toFixed(1)));
}

const BUSINESS_LABEL: Record<ExtractedFacts["business_type"], string> = {
  distributor_importer_wholesaler: "distributor",
  retailer: "retailer",
  other_business: "business",
  consumer: "consumer",
  unknown: "lead",
};

/** Business type plus market, e.g. "distributor in UAE". Omitted when both are unknown. */
function businessClause(facts: ExtractedFacts): string | null {
  // Same rule as brandsClause: no transcript-derived free text after an injection attempt.
  const market =
    facts.named_market === null || facts.injection_attempt ? "" : sanitiseFact(facts.named_market);
  const label = facts.business_type === "unknown" && !market ? null : BUSINESS_LABEL[facts.business_type];
  if (label === null) return null;
  return market ? `${label} in ${market}` : label;
}

function trackRecordClause(b: ScoreBreakdown, facts: ExtractedFacts): string | null {
  const years = facts.years_in_business;
  if (b.legitimacy.track_record === 0 || years === null) return null;
  return `${Math.floor(years)}+ years' track record`;
}

function scaleClause(facts: ExtractedFacts): string | null {
  const accounts = facts.retail_accounts;
  return accounts !== null && accounts > 0 ? `~${formatCount(accounts)} retail accounts` : null;
}

function licenseClause(facts: ExtractedFacts): string | null {
  if (facts.license_status === "confirmed") return "licence confirmed";
  if (facts.license_status === "implied") return "licence implied";
  return null;
}

function volumeClause(facts: ExtractedFacts): string | null {
  const fcl = facts.monthly_fcl;
  return fcl !== null && fcl >= VOLUME_FCL_THRESHOLD ? `~${formatFcl(fcl)} FCL/month` : null;
}

function brandsClause(facts: ExtractedFacts): string | null {
  // Brands and market are the only transcript-derived free text we echo; after
  // an injection attempt, echo none of it back in our output.
  if (facts.injection_attempt) return null;
  const brands = facts.brands
    .map(sanitiseFact)
    .filter((brand) => brand.length > 0)
    .slice(0, REASONING_MAX_BRANDS);
  return brands.length > 0 ? `requesting ${brands.join(" & ")}` : null;
}

/** Strongest positives first; the tail is dropped first when space runs out. */
function positiveClauses(b: ScoreBreakdown, facts: ExtractedFacts): string[] {
  return [
    businessClause(facts),
    trackRecordClause(b, facts),
    scaleClause(facts),
    licenseClause(facts),
    volumeClause(facts),
    brandsClause(facts),
  ].filter((clause): clause is string => clause !== null);
}

const CAP_SENTENCE: Record<CapReason, string> = {
  legitimacy_red_flag: "Capped: legitimacy red flags raised.",
  personal_use: "Capped: looks like personal use, not trade.",
  non_beverage: "Capped: request is not for beverages.",
  sub_fcl_volume: `Capped: stated volume below ${VOLUME_FCL_THRESHOLD} FCL/month.`,
  injection_attempt: "Possible instruction-injection text ignored; capped below Hot.",
};

/** The single most relevant caveat, or null when there is nothing to flag. */
function gapSentence(b: ScoreBreakdown, facts: ExtractedFacts): string | null {
  const topCap = CAP_PRIORITY.find((reason) => b.caps_applied.some((cap) => cap.reason === reason));
  if (topCap) return CAP_SENTENCE[topCap];
  if (facts.license_status === "pending") return "Licence still pending.";
  const noProofPoints = b.license === 0 && b.volume === 0 && b.legitimacy.track_record === 0;
  if (noProofPoints && b.routing === "nurture_pool") {
    return "Little information yet; kept in nurture pool.";
  }
  return null;
}

function firstSentence(tier: string, clauses: string[]): string {
  return clauses.length > 0 ? `${tier}: ${clauses.join("; ")}.` : `${tier}: no qualifying signals yet.`;
}

function assemble(tier: string, clauses: string[], gap: string | null): string {
  return [firstSentence(tier, clauses), gap].filter(Boolean).join(" ");
}

/** Builds 1-2 deterministic sentences that always agree with the score. Never uses LLM free text. */
export function buildReasoning(b: ScoreBreakdown, facts: ExtractedFacts, mode: ScoringMode): string {
  if (mode === "no_lead_evidence") return NO_LEAD_EVIDENCE_REASONING;
  if (mode === "degraded") return DEGRADED_REASONING;

  const clauses = positiveClauses(b, facts);
  const gap = gapSentence(b, facts);
  // Drop lowest-priority clauses (from the end) rather than truncating mid-word.
  while (clauses.length > 0 && assemble(b.tier, clauses, gap).length > REASONING_MAX_CHARS) {
    clauses.pop();
  }
  return assemble(b.tier, clauses, gap);
}
