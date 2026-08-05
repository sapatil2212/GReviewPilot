/**
 * Auth.js v5 configuration.
 *
 * Strategy: JWT session tokens (stateless client), but every request
 * still validates the accompanying `sid` against our UserSession table
 * (stateful server). This gives us server-side revocation with the
 * scale of a JWT.
 *
 * The Prisma adapter is used only to link OAuth `Account` rows. Users
 * are created by our own `authService.signup` so we can enforce tenant
 * creation + owner role atomically. For Google sign-in a new user is
 * created inside the `signIn` callback.
 */

import type { NextAuthConfig, User as AuthUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { UserRole, UserStatus, TenantStatus } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import { env, googleAuthEnabled } from "@/server/utils/env";
import { authService } from "@/server/services/auth.service";
import { sessionService } from "@/server/services/session.service";
import { tenantService } from "@/server/services/tenant.service";
import { userRepository } from "@/server/repositories/user.repository";
import { auditRepository } from "@/server/repositories/audit.repository";
import { loginSchema } from "@/server/validators/auth.schema";
import { AppError, UnauthorizedError } from "@/server/utils/errors";
import { logger } from "@/server/utils/logger";
import { AUTH_COOKIE } from "./cookies";
import { AuditAction } from "@prisma/client";

// The JWT shape is augmented in src/types/next-auth.d.ts, adding
// `tid`, `role`, `sid`, and `stk` on top of the standard fields.
// (NB: we use `stk` — session token key — instead of the standard
//  `jti` claim because Auth.js manages `jti` internally and overwrites
//  whatever we put there on every encode.)

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60, updateAge: 15 * 60 },
  secret: env.AUTH_SECRET,
  trustHost: true,
  pages: {
    signIn: "/auth",
    error: "/auth",
    verifyRequest: "/auth/verify-email",
  },
  cookies: {
    sessionToken: {
      name: AUTH_COOKIE.sessionToken,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: env.NODE_ENV === "production",
      },
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember me", type: "text" },
      },
      async authorize(raw, req) {
        // Validate + normalize input via the same Zod schema as the API.
        const parsed = loginSchema.safeParse({
          email: raw?.email,
          password: raw?.password,
          rememberMe: raw?.rememberMe === "true" || raw?.rememberMe === true,
        });
        if (!parsed.success) {
          throw new UnauthorizedError("INVALID_CREDENTIALS", "Invalid email or password");
        }
        const user = await authService.verifyCredentials(parsed.data, req as Request);
        // Return only what the JWT callback needs to build our token.
        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          tenantId: user.tenantId,
          role: user.role,
          firstName: user.firstName,
        } satisfies AuthUser & {
          tenantId: string;
          role: UserRole;
          firstName: string;
        };
      },
    }),
    ...(googleAuthEnabled
      ? [
          Google({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: false,
          }),
        ]
      : []),
  ],
  callbacks: {
    /**
     * Runs on every sign-in attempt (including OAuth callbacks).
     * For Google: create tenant + user on first sign-in.
     * For Credentials: verification already happened in `authorize`.
     */
    async signIn({ user, account, profile }) {
      // Credentials path — `authorize` handled everything.
      if (account?.provider === "credentials") return true;

      if (account?.provider === "google") {
        const email = (user.email ?? "").toLowerCase();
        if (!email) return false;

        const existing = await userRepository.findByEmail(email);
        if (existing) {
          if (existing.status === UserStatus.BLOCKED || existing.status === UserStatus.DELETED) {
            return false;
          }
          const tenant = await prisma.tenant.findUnique({ where: { id: existing.tenantId } });
          if (!tenant || tenant.status === TenantStatus.SUSPENDED || tenant.status === TenantStatus.DELETED) {
            return false;
          }
          // Auto-mark email verified when Google confirms it.
          if (!existing.emailVerified) {
            await userRepository.updateById(existing.id, {
              emailVerified: new Date(),
              status: UserStatus.ACTIVE,
            });
          }
          // Hydrate the auth `user` object for the jwt callback.
          (user as AuthUser & { id?: string }).id = existing.id;
          (user as unknown as { tenantId: string }).tenantId = existing.tenantId;
          (user as unknown as { role: UserRole }).role = existing.role;
          (user as unknown as { firstName: string }).firstName = existing.firstName;
          await auditRepository.record({
            action: AuditAction.GOOGLE_LOGIN,
            userId: existing.id,
            tenantId: existing.tenantId,
          });
          return true;
        }

        // New Google user — create tenant + user.
        const displayName = (profile?.name as string | undefined) ?? email.split("@")[0]!;
        const parts = displayName.split(/\s+/);
        const firstName = parts[0] ?? "Owner";
        const lastName = parts.slice(1).join(" ") || "";
        const businessName = `${firstName}'s workspace`;

        try {
          const created = await prisma.$transaction(async (tx) => {
            const slug = await tenantService.generateUniqueSlug(businessName);
            const tenant = await tx.tenant.create({
              data: {
                name: businessName,
                slug,
                trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
              },
            });
            const created = await tx.user.create({
              data: {
                tenantId: tenant.id,
                firstName,
                lastName,
                email,
                avatar: (profile?.picture as string | undefined) ?? null,
                role: UserRole.TENANT_OWNER,
                status: UserStatus.ACTIVE,
                emailVerified: new Date(),
              },
            });
            return { tenant, user: created };
          });
          (user as AuthUser & { id?: string }).id = created.user.id;
          (user as unknown as { tenantId: string }).tenantId = created.tenant.id;
          (user as unknown as { role: UserRole }).role = created.user.role;
          (user as unknown as { firstName: string }).firstName = created.user.firstName;

          await auditRepository.record({
            action: AuditAction.SIGNUP,
            userId: created.user.id,
            tenantId: created.tenant.id,
            metadata: { provider: "google" },
          });
          await auditRepository.record({
            action: AuditAction.GOOGLE_LINKED,
            userId: created.user.id,
            tenantId: created.tenant.id,
          });
          return true;
        } catch (err) {
          logger.error("Google signup failed", {
            err: err instanceof Error ? err.message : String(err),
          });
          return false;
        }
      }

      return true;
    },

    /**
     * Runs on every session read AND every sign-in. We use this to
     *   - stamp our tenantId/role/sid onto the token on first sign-in
     *   - look up the DB UserSession on subsequent reads and revoke
     *     the token if anything looks off (user blocked, session
     *     revoked, tenant suspended, etc.).
     */
    async jwt({ token, user }): Promise<JWT> {
      const t = token as JWT & {
        tid?: string;
        role?: UserRole;
        sid?: string;
        stk?: string;
        exp?: number;
      };

      // Initial sign-in — `user` is set. Create UserSession row.
      if (user && (user as AuthUser & { tenantId?: string }).tenantId) {
        const u = user as AuthUser & {
          id: string;
          tenantId: string;
          role: UserRole;
          firstName?: string;
          email?: string;
        };
        try {
          const created = await sessionService.create({
            userId: u.id,
            tenantId: u.tenantId,
            notifyNewDeviceEmail: u.email ?? undefined,
            notifyNewDeviceFirstName: u.firstName,
          });
          t.sub = u.id;
          t.tid = u.tenantId;
          t.role = u.role;
          t.sid = created.session.id;
          t.stk = created.jti;
          t.exp = Math.floor(created.expiresAt.getTime() / 1000);
        } catch (err) {
          logger.error("Session create failed on JWT init", {
            err: err instanceof Error ? err.message : String(err),
          });
          // Force sign-out on failure by returning an empty token.
          return {} as JWT;
        }
        return t;
      }

      // Subsequent reads — validate against DB.
      if (!t.stk || !t.sid) return t;
      try {
        const session = await sessionService.validateByJti(t.stk);
        if (!session || session.id !== t.sid) return {} as JWT;
        if (session.userId !== t.sub) return {} as JWT;

        // Re-check user + tenant status on every read.
        const dbUser = await userRepository.findByIdSafe(session.userId);
        if (!dbUser || dbUser.status !== UserStatus.ACTIVE) return {} as JWT;
        if (dbUser.tenantId !== t.tid) return {} as JWT;

        // Role may have changed mid-session.
        if (dbUser.role !== t.role) t.role = dbUser.role;

        // Idle timeout is enforced inside validateByJti; touch activity.
        await sessionService.touch(session);

        // Rotate near expiry.
        const rotated = await sessionService.maybeRotate(session);
        if (rotated) {
          t.stk = rotated.jti;
          t.exp = Math.floor(rotated.expiresAt.getTime() / 1000);
        }

        return t;
      } catch (err) {
        logger.error("JWT callback failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        return {} as JWT;
      }
    },

    /**
     * Shapes the object returned by `auth()` and `useSession()`.
     * NEVER include email or PII fields the client shouldn't cache.
     */
    async session({ session, token }) {
      const t = token as JWT & {
        tid?: string;
        role?: UserRole;
        sid?: string;
      };
      if (!t?.sub || !t?.tid || !t?.role || !t?.sid) {
        // Return an invalid session; UI will treat as signed-out.
        return { ...session, user: { ...session.user, id: "" } };
      }
      return {
        ...session,
        user: {
          ...session.user,
          id: t.sub,
        },
        tenantId: t.tid,
        role: t.role,
        sessionId: t.sid,
      };
    },
  },
  events: {
    async signOut(message) {
      // Auth.js v5 passes either { token } or { session } depending on strategy.
      const t =
        "token" in message
          ? (message.token as (JWT & { tid?: string; sid?: string }) | null)
          : null;
      if (t?.sid) {
        try {
          await sessionService.revoke(t.sid, "USER_LOGOUT");
          await auditRepository.record({
            action: AuditAction.LOGOUT,
            userId: t.sub,
            tenantId: t.tid,
          });
        } catch (err) {
          logger.warn("signOut event failed", {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
  },
};

// Re-export the AppError type as a convenience so callers can catch
// AuthServiceErrors coming through Auth.js.
export type { AppError };
