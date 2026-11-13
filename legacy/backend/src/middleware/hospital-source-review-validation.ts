import { z } from 'zod'

const reviewIdSchema = z.string()
  .trim()
  .min(1)
  .max(240)
  .regex(/^[A-Za-z0-9._-]+#entries-\d+-\d+$/)

const reviewText = (max: number) => z.string()
  .trim()
  .min(1)
  .max(max)
  .refine(
    (value) => !/[\r\n]/.test(value) &&
      !/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/i.test(value) &&
      !/(?:\+?91[\s().-]*)?[6-9](?:[\s().-]*\d){9}/.test(value) &&
      !/\b(?:password|secret|credential|token|api[\s_-]?key)\b/i.test(value),
    'Review text must not contain contact details or secrets.',
  )

export const hospitalSourceReviewDecisionSchema = z.object({
  reviewId: reviewIdSchema,
  sourceObservationIds: z.tuple([z.string().uuid(), z.string().uuid()])
    .refine(([left, right]) => left !== right, 'Choose two different source observations.'),
  decision: z.enum(['same_hospital', 'different_hospitals', 'needs_more_evidence']),
  reason: reviewText(2000).refine((value) => value.length >= 20, 'Provide a review reason.'),
  evidenceReference: reviewText(500),
}).strict()

export const createDraftHospitalsFromReviewSchema = z.object({
  reviewId: reviewIdSchema,
}).strict()

export type HospitalSourceReviewDecisionInput = z.infer<
  typeof hospitalSourceReviewDecisionSchema
>
