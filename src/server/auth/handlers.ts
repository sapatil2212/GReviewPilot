/**
 * Auth.js v5 entry point. Exports `handlers`, `auth`, `signIn`, `signOut`
 * built from our config for use across the app tree.
 *
 * `handlers` -> passed to app/api/auth/[...nextauth]/route.ts
 * `auth`     -> server helper for reading the session inside RSC / route handlers
 * `signIn`   -> server-side sign-in (used by our /api/auth/login route)
 * `signOut`  -> server-side sign-out
 */

import NextAuth from "next-auth";
import { authConfig } from "./config";

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth(authConfig);
