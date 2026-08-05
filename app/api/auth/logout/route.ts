/**
 * POST /api/auth/logout
 * Server-side logout. Revokes the current session row and clears
 * the Auth.js cookie via the `signOut` helper.
 */

import { signOut } from "@/server/auth/handlers";
import { ok, handleError } from "@/server/utils/response";

export const runtime = "nodejs";

export async function POST() {
  try {
    await signOut({ redirect: false });
    return ok({ ok: true }, { message: "Signed out" });
  } catch (err) {
    return handleError(err);
  }
}
