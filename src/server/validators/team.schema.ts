/**
 * Zod schemas for the Team Management module.
 *
 * Notes on role assignment:
 *   - SUPER_ADMIN is a system-level role and never assignable via API.
 *   - TENANT_OWNER can only be granted by an existing TENANT_OWNER.
 *   - Everything else can be granted by roles allowed under the
 *     "user:changeRole" / "user:invite" permissions.
 */

import { InvitationStatus, UserRole, UserStatus } from "@prisma/client";
import { z } from "zod";

// Assignable roles for tenant-scoped operations (invite/change-role).
export const ASSIGNABLE_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.STAFF,
  UserRole.VIEWER,
] as const;

const assignableRoleSchema = z.enum(ASSIGNABLE_ROLES);

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(255);

const nameField = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => (v ? v : undefined));

const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/\d/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");

// ---------- Invitations ----------

export const createInvitationSchema = z.object({
  email: emailField,
  firstName: nameField,
  lastName: nameField,
  role: assignableRoleSchema,
  message: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : undefined)),
  locationIds: z.array(z.string().cuid()).max(50).optional(),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const listInvitationsQuerySchema = z.object({
  status: z.nativeEnum(InvitationStatus).optional(),
  role: assignableRoleSchema.optional(),
});
export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>;

export const acceptInvitationSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: strongPassword,
    confirmPassword: z.string(),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const previewInvitationQuerySchema = z.object({
  token: z.string().min(20).max(200),
});

// ---------- Team members ----------

export const listMembersQuerySchema = z.object({
  role: assignableRoleSchema.optional(),
  status: z.nativeEnum(UserStatus).optional(),
  locationId: z.string().cuid().optional(),
});
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;

export const updateMemberSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v : undefined)),
  avatar: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const changeRoleSchema = z.object({
  role: assignableRoleSchema,
});
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

export const changeStatusSchema = z.object({
  status: z.enum([UserStatus.ACTIVE, UserStatus.BLOCKED]),
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

// ---------- Location assignments ----------

export const assignLocationSchema = z.object({
  locationId: z.string().cuid(),
});
export type AssignLocationInput = z.infer<typeof assignLocationSchema>;

export const assignUserSchema = z.object({
  userId: z.string().cuid(),
});
export type AssignUserInput = z.infer<typeof assignUserSchema>;
