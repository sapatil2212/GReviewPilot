/**
 * Auth.js v5 catch-all handler.
 * Handles: sign-in, sign-out, callback, csrf, session, providers.
 */

import { handlers } from "@/server/auth/handlers";

export const { GET, POST } = handlers;

// Auth.js reads/writes cookies, so this route must run in Node.
export const runtime = "nodejs";
