/**
 * GET /q/[code]
 *
 * PUBLIC dynamic-QR redirect. Every QR image encodes this URL. We log
 * the scan (device, browser, country, unique-ness via a cookie) then
 * 302-redirect to the QR's current target. Because the target lives in
 * the DB, the printed QR can be re-pointed anytime without reprinting.
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { qrCodeService } from "@/server/services/qrCode.service";
import { env } from "@/server/utils/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "grp_qv"; // qr visitor id

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  // Stable visitor id for unique-scan counting.
  let sessionId = req.cookies.get(COOKIE)?.value ?? null;
  let setCookie = false;
  if (!sessionId) {
    sessionId = randomUUID();
    setCookie = true;
  }

  const result = await qrCodeService.handleScan(code, req, sessionId).catch(
    () => null,
  );

  const dest =
    result?.targetUrl ??
    // Unknown/paused code — send them somewhere friendly.
    `${env.APP_URL}/`;

  const res = NextResponse.redirect(dest, { status: 302 });
  if (setCookie) {
    res.cookies.set(COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  // QR targets change; never let the browser cache the redirect.
  res.headers.set("Cache-Control", "no-store");
  return res;
}
