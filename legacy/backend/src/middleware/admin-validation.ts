import { z } from 'zod'

const nullableText = (max: number) => z.string().trim().max(max).nullable()
  .transform((value) => value || null)
const nullableLatitude = z.number().finite().min(-90).max(90).nullable()
const nullableLongitude = z.number().finite().min(-180).max(180).nullable()
const nullableWebsite = z.string()
  .trim()
  .url()
  .max(300)
  .refine((value) => /^https?:\/\//i.test(value), 'Website must use HTTP or HTTPS.')
  .nullable()
  .or(z.literal(''))
  .transform((value) => value || null)

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
})

export const adminHospitalQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  listingStatus: z.enum(['draft', 'published', 'hidden']).optional(),
  verificationStatus: z.enum([
    'pending', 'verified', 'rejected', 'expired', 'disputed', 'unverified',
  ]).optional(),
})

export const adminHospitalSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: nullableText(500),
  city: nullableText(120),
  region: nullableText(120),
  postalCode: nullableText(20),
  phone: nullableText(50),
  website: nullableWebsite,
  description: nullableText(4000),
  facilityType: nullableText(100),
  latitude: nullableLatitude,
  longitude: nullableLongitude,
  listingStatus: z.enum(['draft', 'published', 'hidden']),
  specialties: z.array(z.string().trim().min(1).max(100)).max(40)
    .refine((items) => new Set(items.map((item) => item.toLocaleLowerCase())).size === items.length, {
      message: 'Specialties must be unique.',
    }),
  verificationStatus: z.enum([
    'unverified', 'pending', 'verified', 'rejected', 'expired', 'disputed',
  ]),
  verificationSourceType: z.enum([
    'provider', 'government_registry', 'public_directory', 'insurer', 'manual_review', 'other',
  ]).nullable(),
  verificationSourceName: nullableText(200),
  verificationSourceReference: nullableText(500),
  verificationExpiresAt: z.string().datetime({ offset: true }).nullable(),
}).strict().superRefine((value, context) => {
  if ((value.latitude === null) !== (value.longitude === null)) {
    context.addIssue({
      code: 'custom',
      path: ['latitude'],
      message: 'Latitude and longitude must both be provided or both be empty.',
    })
  }
  if (
    value.verificationStatus !== 'unverified' &&
    (!value.verificationSourceType || !value.verificationSourceName?.trim())
  ) {
    context.addIssue({
      code: 'custom',
      path: ['verificationSourceName'],
      message: 'A source type and source name are required for verification records.',
    })
  }
  if (value.listingStatus === 'published' && value.verificationStatus !== 'verified') {
    context.addIssue({
      code: 'custom',
      path: ['listingStatus'],
      message: 'A hospital must have verified information before it can be published.',
    })
  }
  if (value.listingStatus === 'published' && (
    value.city?.trim().toLocaleLowerCase('en') !== 'sonipat' ||
    value.region?.trim().toLocaleLowerCase('en') !== 'haryana'
  )) {
    context.addIssue({
      code: 'custom',
      path: ['city'],
      message: 'Published records must be verified as Sonipat, Haryana listings.',
    })
  }
})

export const ambulanceProviderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: nullableText(50),
  website: nullableWebsite,
  status: z.enum(['active', 'inactive', 'suspended']),
}).strict()

export const ambulanceVehicleSchema = z.object({
  providerId: z.string().uuid(),
  vehicleType: z.string().trim().min(1).max(100),
  registrationNumber: nullableText(50),
  status: z.enum(['available', 'assigned', 'unavailable', 'maintenance']),
  latitude: nullableLatitude,
  longitude: nullableLongitude,
}).strict().superRefine((value, context) => {
  if ((value.latitude === null) !== (value.longitude === null)) {
    context.addIssue({
      code: 'custom',
      path: ['latitude'],
      message: 'Latitude and longitude must both be provided or both be empty.',
    })
  }
})

export const uuidParamSchema = z.string().uuid()

export type AdminHospitalQuery = z.infer<typeof adminHospitalQuerySchema>
export type AdminHospitalInput = z.infer<typeof adminHospitalSchema>
export type AmbulanceProviderInput = z.infer<typeof ambulanceProviderSchema>
export type AmbulanceVehicleInput = z.infer<typeof ambulanceVehicleSchema>
