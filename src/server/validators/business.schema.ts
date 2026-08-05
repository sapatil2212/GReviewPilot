/**
 * Zod schemas for the Business Management module.
 *
 * These are the ONLY source of truth for input validation at the
 * service/route boundary. Structures returned to clients live in
 * repositories/services and are typed by Prisma.
 */

import { BusinessAttributeType, LocationStatus } from "@prisma/client";
import { z } from "zod";

// ---------- Common primitives ----------

const optionalTrimmedString = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const iso2Country = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Country must be a 2-letter ISO code");

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:mm 24-hour format");

const websiteField = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine(
    (v) => !v || /^(https?:\/\/)?[^\s]+\.[^\s]{2,}$/i.test(v),
    "Enter a valid website (e.g. acme.com or https://acme.com)",
  );

const phoneField = z
  .string()
  .trim()
  .max(30)
  .optional()
  .transform((v) => (v ? v : undefined));

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(255)
  .optional()
  .transform((v) => (v ? v : undefined));

// ---------- Working hours ----------

const timeRangeSchema = z
  .object({ open: hhmm, close: hhmm })
  .refine((r) => r.open < r.close, {
    message: "Close time must be after open time",
    path: ["close"],
  });

const daySchema = z.object({
  isOpen: z.boolean(),
  ranges: z.array(timeRangeSchema).max(3),
});

/**
 * Canonical shape for the `Location.workingHours` JSON blob.
 * Keys are lowercase weekday names, values are per-day schedules
 * with 0–3 time ranges. All-closed days must have `ranges: []`.
 */
export const workingHoursSchema = z.object({
  monday: daySchema,
  tuesday: daySchema,
  wednesday: daySchema,
  thursday: daySchema,
  friday: daySchema,
  saturday: daySchema,
  sunday: daySchema,
});

export type WorkingHours = z.infer<typeof workingHoursSchema>;

// ---------- Business Profile ----------

export const updateBusinessProfileSchema = z.object({
  legalName: optionalTrimmedString(200),
  description: optionalTrimmedString(5000),
  shortDescription: optionalTrimmedString(500),
  coverImage: optionalTrimmedString(1000),
  foundedYear: z
    .number()
    .int()
    .min(1800)
    .max(new Date().getFullYear())
    .optional(),
  registrationNumber: optionalTrimmedString(100),
  gstNumber: optionalTrimmedString(100),
  taxNumber: optionalTrimmedString(100),
  primaryCategoryId: z.string().cuid().optional(),

  // Tenant-level fields we allow updating from the same endpoint.
  // Kept optional so callers can PATCH just the profile-side data.
  tenant: z
    .object({
      name: z.string().trim().min(1).max(150).optional(),
      logo: optionalTrimmedString(1000),
      businessEmail: emailField,
      phone: phoneField,
      website: websiteField,
      industry: optionalTrimmedString(100),
      businessType: optionalTrimmedString(100),
      employeeCount: optionalTrimmedString(50),
      country: iso2Country.optional(),
      timezone: optionalTrimmedString(60),
      currency: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{3}$/)
        .optional(),
      language: optionalTrimmedString(10),
      address: z
        .object({
          line1: optionalTrimmedString(200),
          line2: optionalTrimmedString(200),
          city: optionalTrimmedString(100),
          state: optionalTrimmedString(100),
          postalCode: optionalTrimmedString(20),
          country: iso2Country.optional(),
        })
        .optional(),
      socialLinks: z
        .object({
          linkedin: optionalTrimmedString(500),
          twitter: optionalTrimmedString(500),
          facebook: optionalTrimmedString(500),
          instagram: optionalTrimmedString(500),
          youtube: optionalTrimmedString(500),
          whatsapp: optionalTrimmedString(500),
          website: optionalTrimmedString(500),
        })
        .optional(),
    })
    .optional(),
});

export type UpdateBusinessProfileInput = z.infer<
  typeof updateBusinessProfileSchema
>;

// ---------- Categories ----------

export const addCategorySchema = z.object({
  categoryId: z.string().cuid(),
  setAsPrimary: z.boolean().optional().default(false),
});

export type AddCategoryInput = z.infer<typeof addCategorySchema>;

export const categoryCatalogQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
  parentId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal("root").transform(() => null as unknown as string)),
  activeOnly: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
});

// ---------- Attributes ----------

export const setAttributeSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(
      /^[a-z][a-z0-9_]*$/i,
      "Key must start with a letter and contain only letters, digits, or underscores",
    ),
  value: z.string().max(5000),
  type: z.nativeEnum(BusinessAttributeType).default(BusinessAttributeType.TEXT),
});

export type SetAttributeInput = z.infer<typeof setAttributeSchema>;

export const bulkSetAttributesSchema = z.object({
  attributes: z.array(setAttributeSchema).min(1).max(200),
});

export type BulkSetAttributesInput = z.infer<typeof bulkSetAttributesSchema>;

// ---------- Locations ----------

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(150),
  slug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, digits, or hyphens")
    .optional(),
  storeCode: optionalTrimmedString(50),

  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: optionalTrimmedString(200),
  city: z.string().trim().min(1).max(100),
  state: optionalTrimmedString(100),
  postalCode: optionalTrimmedString(20),
  country: iso2Country,

  latitude: z.number().gte(-90).lte(90).optional(),
  longitude: z.number().gte(-180).lte(180).optional(),

  googleLocationId: optionalTrimmedString(200),
  googlePlaceId: optionalTrimmedString(200),

  phone: phoneField,
  email: emailField,
  website: websiteField,

  workingHours: workingHoursSchema.optional(),
  timezone: optionalTrimmedString(60),

  assignedManagerId: z.string().cuid().optional(),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.partial();
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export const updateWorkingHoursSchema = z.object({
  workingHours: workingHoursSchema,
});

export const assignManagerSchema = z.object({
  managerId: z.string().cuid().nullable(),
});

export const listLocationsQuerySchema = z.object({
  status: z.nativeEnum(LocationStatus).optional(),
  managerId: z.string().cuid().optional(),
  includeDeleted: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type ListLocationsQuery = z.infer<typeof listLocationsQuerySchema>;

// ---------- Holiday hours ----------

export const setHolidayHoursSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    isClosed: z.boolean().default(false),
    openTime: hhmm.optional(),
    closeTime: hhmm.optional(),
    note: optionalTrimmedString(255),
  })
  .refine(
    (v) =>
      v.isClosed
        ? true
        : Boolean(v.openTime && v.closeTime && v.openTime < v.closeTime),
    {
      message:
        "Open/close time is required and open must be before close when the location is not marked closed",
      path: ["closeTime"],
    },
  );

export type SetHolidayHoursInput = z.infer<typeof setHolidayHoursSchema>;

export const updateHolidayHoursSchema = z
  .object({
    isClosed: z.boolean().optional(),
    openTime: hhmm.optional(),
    closeTime: hhmm.optional(),
    note: optionalTrimmedString(255),
  })
  .refine(
    (v) =>
      v.isClosed === true ||
      (v.openTime === undefined && v.closeTime === undefined) ||
      (v.openTime && v.closeTime && v.openTime < v.closeTime),
    {
      message: "Open time must be before close time",
      path: ["closeTime"],
    },
  );

export type UpdateHolidayHoursInput = z.infer<typeof updateHolidayHoursSchema>;
