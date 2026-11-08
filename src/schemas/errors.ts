import { z } from "zod";

export const ErrorCodeSchema = z.enum([
  "invalid_json", "validation_error", "payload_too_large", "unauthorized",
  "not_found", "method_not_allowed", "server_misconfigured", "internal_error",
]);

export const ErrorBodySchema = z.strictObject({
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string(),
    request_id: z.string(),
    details: z.array(z.strictObject({ path: z.string(), message: z.string() })).optional(),
  }),
});

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ErrorBody = z.infer<typeof ErrorBodySchema>;
