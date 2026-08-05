/**
 * Cookie constants.
 *
 * Auth.js sets its own cookies internally. We define the name centrally
 * so middleware, guards, and logout logic can reference the same key.
 * In production, Auth.js prefixes the cookie with __Secure- when the
 * URL is https, giving us __Host-style protection.
 */

import { isProd } from "@/server/utils/env";

/** Auth.js v5 default cookie names. */
export const AUTH_COOKIE = {
  sessionToken: isProd ? "__Secure-authjs.session-token" : "authjs.session-token",
  csrf: isProd ? "__Host-authjs.csrf-token" : "authjs.csrf-token",
  callbackUrl: isProd ? "__Secure-authjs.callback-url" : "authjs.callback-url",
} as const;
