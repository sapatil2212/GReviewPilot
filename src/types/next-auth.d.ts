/**
 * Module augmentation for Auth.js v5.
 * Adds our tenant/role/sessionId to the shape returned by `auth()`
 * and `useSession()`.
 */

import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
    };
    tenantId: string;
    role: UserRole;
    sessionId: string;
  }

  interface User {
    id: string;
    tenantId?: string;
    role?: UserRole;
    firstName?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    tid?: string;
    role?: UserRole;
    sid?: string;
    /**
     * Session token key — hashed and compared against UserSession.
     * We deliberately avoid the standard `jti` claim because Auth.js
     * manages that internally and rewrites it on every JWT encode.
     */
    stk?: string;
  }
}

export {};
