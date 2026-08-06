/**
 * Role-based access control.
 *
 * Every permission is a colon-separated verb defined once here. Services
 * check permissions via `can()` or `requirePermission()` — never by
 * inspecting the raw role string. Adding a new capability means adding
 * one row to `PERMISSIONS`; no route changes required.
 */

import { UserRole } from "@prisma/client";
import { ForbiddenError } from "@/server/utils/errors";
import type { AuthContext } from "@/server/auth/requireSession";

// Extend this list as new modules land. Naming: "<resource>:<action>".
export const PERMISSIONS = {
  // Tenant / workspace
  "tenant:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  "tenant:update": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER],
  "tenant:delete": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER],

  // Users / team
  "user:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],
  "user:invite": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER, UserRole.ADMIN],
  "user:update": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER, UserRole.ADMIN],
  "user:remove": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER],
  "user:changeRole": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER],
  "user:block": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER, UserRole.ADMIN],

  // Invitations
  "invitation:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],
  "invitation:manage": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
  ],

  // User ↔ Location assignments (staff-to-branch)
  "user:location:assign": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],

  // Media
  "media:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  "media:upload": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
  ],
  "media:manage": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],
  "media:delete": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],

  // Sessions
  "session:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  "session:revoke": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],

  // Billing (placeholder for future modules)
  "billing:manage": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER],
  "audit:read": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER, UserRole.ADMIN],

  // Business profile
  "business:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  "business:update": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
  ],

  // Business categories / attributes
  "category:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  "category:manage": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
  ],
  "attribute:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  "attribute:manage": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
  ],

  // Locations
  "location:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  "location:create": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
  ],
  "location:update": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],
  "location:archive": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
  ],
  "location:delete": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER],
  "location:assignManager": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
  ],

  // Google Business Integration
  "google:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  "google:manage": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
  ],
  "google:sync": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],

  // Reviews
  "review:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  "review:reply": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
  ],
  "review:manage": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],
  "review:sync": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],
  "review:tag:manage": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],

  // AI Business Personality
  //
  // Reading the personality is broad (STAFF draft replies and need to see the
  // rules they are working within), but editing it is not: it is the brand
  // voice for every AI feature at once, so a bad edit is workspace-wide.
  "ai:personality:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  "ai:personality:update": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
  ],
  /** Generate or preview a draft. Same audience as review:reply. */
  "ai:reply:generate": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
  ],
  /**
   * Approve someone else's draft for sending. Excludes STAFF on purpose —
   * MANAGER_APPROVAL mode is meaningless if the author can approve their own
   * draft.
   */
  "ai:reply:approve": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],

  // Posts
  "post:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  "post:create": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
  ],
  "post:publish": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],
  "post:delete": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],

  // QR codes
  "qr:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  "qr:manage": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],

  // Analytics
  "analytics:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],

  // Website builder — sites and pages
  "site:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  "site:create": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER, UserRole.ADMIN],
  // Editing content is a day-to-day task, so MANAGER and STAFF are included.
  "site:update": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
  ],
  // Publishing changes what the public sees, so it stops at MANAGER. This is
  // the seam an approval workflow plugs into later.
  "site:publish": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],
  "site:delete": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER, UserRole.ADMIN],
  // Theme and global styles affect every page at once.
  "site:theme": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],
  "site:ai": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
  ],

  // Website builder — domains. Separate from site:update because a bad DNS
  // change takes the whole site offline.
  "site:domain:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],
  "site:domain:manage": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER, UserRole.ADMIN],

  // Website builder — CMS
  "cms:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.VIEWER,
  ],
  // Changing a collection's field definitions can invalidate existing items.
  "cms:schema": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER, UserRole.ADMIN],
  "cms:write": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
  ],
  "cms:publish": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],
  "cms:delete": [UserRole.SUPER_ADMIN, UserRole.TENANT_OWNER, UserRole.ADMIN],

  // Website builder — forms and leads
  "site:form:manage": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  ],
  "site:lead:read": [
    UserRole.SUPER_ADMIN,
    UserRole.TENANT_OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
  ],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole, permission: Permission): boolean {
  const allowed = PERMISSIONS[permission] as readonly UserRole[];
  return allowed.includes(role);
}

export function requirePermission(ctx: AuthContext, permission: Permission): void {
  if (!can(ctx.role, permission)) {
    throw new ForbiddenError(
      `Role ${ctx.role} is not permitted to perform ${permission}`,
    );
  }
}
