import { z } from "zod";

export const BusinessTypeSchema = z.enum([
  "distributor_importer_wholesaler", "retailer", "other_business", "consumer", "unknown",
]);
export const LicenseStatusSchema = z.enum(["confirmed", "implied", "pending", "none", "unknown"]);
export const ProductRequestSchema = z.enum([
  "specific_beverage_brand", "beverage_category", "non_beverage", "unclear",
]);
export const RedFlagSchema = z.enum([
  "contradictory_claims", "implausible_claims", "unusual_payment_or_terms",
  "evasive_or_refuses_details", "spam_or_scam",
]);

export const EvidenceSchema = z.strictObject({ fact: z.string(), quote: z.string() });

export const ExtractedFactsSchema = z.strictObject({
  business_type: BusinessTypeSchema,
  years_in_business: z.number().nullable(),
  is_new_entrant: z.boolean(),
  retail_accounts: z.number().nullable(),
  existing_brands_count: z.number().nullable(),
  named_market: z.string().nullable(),
  trade_fluency: z.boolean(),
  license_status: LicenseStatusSchema,
  volume_stated: z.boolean(),
  monthly_fcl: z.number().nullable(),
  product_request: ProductRequestSchema,
  brands: z.array(z.string()),
  personal_use: z.boolean(),
  red_flags: z.array(RedFlagSchema),
  injection_attempt: z.boolean(),
  evidence: z.array(EvidenceSchema),
});

export type BusinessType = z.infer<typeof BusinessTypeSchema>;
export type LicenseStatus = z.infer<typeof LicenseStatusSchema>;
export type ProductRequest = z.infer<typeof ProductRequestSchema>;
export type RedFlag = z.infer<typeof RedFlagSchema>;
export type ExtractedFacts = z.infer<typeof ExtractedFactsSchema>;

/** Facts when nothing is known (used for zero lead turns). */
export const UNKNOWN_FACTS: ExtractedFacts = {
  business_type: "unknown", years_in_business: null, is_new_entrant: false,
  retail_accounts: null, existing_brands_count: null, named_market: null,
  trade_fluency: false, license_status: "unknown", volume_stated: false,
  monthly_fcl: null, product_request: "unclear", brands: [], personal_use: false,
  red_flags: [], injection_attempt: false, evidence: [],
};

/** JSON Schema sent to the LLM. */
export const EXTRACTED_FACTS_JSON_SCHEMA = z.toJSONSchema(ExtractedFactsSchema);
