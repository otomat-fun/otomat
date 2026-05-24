import { z } from 'zod';

const metadataRecord = z.record(z.string(), z.unknown());

export const resourceInfoSchema = z.object({
  url: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
});

export const paymentRequirementItemSchema = z.object({
  scheme: z.string(),
  network: z.string(),
  amount: z.string(),
  asset: z.string(),
  payTo: z.string(),
  maxTimeoutSeconds: z.number().optional(),
  extra: metadataRecord.optional(),
});

export const paymentRequirementsSchema = z.object({
  x402Version: z.number(),
  error: z.string().optional(),
  resource: resourceInfoSchema,
  accepts: z.array(paymentRequirementItemSchema),
  extensions: metadataRecord.optional(),
});

export const paymentPayloadSchema = z.object({
  x402Version: z.number(),
  scheme: z.string(),
  network: z.string(),
  accepted: paymentRequirementItemSchema,
  payload: metadataRecord,
  extensions: metadataRecord.optional(),
});

export const settlementResponseSchema = z.object({
  success: z.boolean(),
  payer: z.string().optional(),
  transaction: z.string().optional(),
  network: z.string().optional(),
  errorReason: z.string().optional(),
});

export const verifyRequestSchema = z.object({
  paymentPayload: paymentPayloadSchema,
  paymentRequirements: paymentRequirementItemSchema,
});

export const verifyResponseSchema = z.object({
  isValid: z.boolean(),
  payer: z.string().optional(),
  invalidReason: z.string().optional(),
});

export type PaymentRequirementItemSchema = z.infer<typeof paymentRequirementItemSchema>;
export type PaymentRequirementsSchema = z.infer<typeof paymentRequirementsSchema>;
export type PaymentPayloadSchema = z.infer<typeof paymentPayloadSchema>;
export type SettlementResponseSchema = z.infer<typeof settlementResponseSchema>;
export type VerifyRequestSchema = z.infer<typeof verifyRequestSchema>;
export type VerifyResponseSchema = z.infer<typeof verifyResponseSchema>;
