/**
 * Extracts request metadata (IP, user agent, browser, OS, device)
 * for session tracking and audit logs.
 */

import { UAParser } from "ua-parser-js";

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
}

export function extractRequestContext(req: Request | Headers): RequestContext {
  const headers = req instanceof Headers ? req : req.headers;

  const forwardedFor = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip");
  const cfConnectingIp = headers.get("cf-connecting-ip");

  const ipAddress =
    cfConnectingIp ??
    realIp ??
    (forwardedFor ? forwardedFor.split(",")[0]?.trim() ?? null : null);

  const userAgent = headers.get("user-agent");

  let browser: string | null = null;
  let os: string | null = null;
  let device: string | null = null;

  if (userAgent) {
    const parsed = new UAParser(userAgent).getResult();
    browser = parsed.browser.name
      ? `${parsed.browser.name}${parsed.browser.version ? " " + parsed.browser.version : ""}`
      : null;
    os = parsed.os.name
      ? `${parsed.os.name}${parsed.os.version ? " " + parsed.os.version : ""}`
      : null;
    device = parsed.device.type ?? "desktop";
  }

  return { ipAddress, userAgent, browser, os, device };
}
