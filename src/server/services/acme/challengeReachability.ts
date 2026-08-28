/**
 * Pre-flight for HTTP-01 validation.
 *
 * Answers the one question that decides whether an ACME order can possibly
 * succeed: does `http://<hostname>/.well-known/acme-challenge/<token>` reach
 * *this* app and return what we put there?
 *
 * It exists because the failure it detects is otherwise invisible. When the path
 * is broken the CA reports a generic authorization failure, the app records
 * "issuance failed", and the operator has no way to tell whether the cause was
 * DNS, a redirect on port 80, a missing nginx include, a stale default server,
 * or a genuine CA problem. Each of those needs a different fix. Running the
 * exact request the CA will run, from here, turns that into a specific sentence.
 *
 * It also protects the rate limit. Let's Encrypt allows roughly five failed
 * authorizations per hostname per hour and a handful of certificates per week;
 * an unreachable challenge path fails every single attempt, so retrying blindly
 * spends the whole budget on a request that could never have worked and locks
 * the domain out of HTTPS while the real problem is still there.
 *
 * The sentinel is stored in the same table the CA reads from, so a pass proves
 * the whole path end to end: nginx listener, proxy, middleware carve-out, route
 * handler, and database. A hand-rolled probe against a fixed path would prove
 * less.
 */

import { randomBytes } from "node:crypto";
import { acmeChallengeStore } from "./challengeStore";
import { logger } from "@/server/utils/logger";

export interface ChallengeReachability {
  /** True when the sentinel came back intact — validation will work. */
  reachable: boolean;
  /**
   * True when the observed failure is definitely fatal to validation, so
   * submitting an order would waste a rate-limited attempt.
   *
   * False for inconclusive failures. A VPS often cannot reach its own public IP
   * (no NAT hairpinning / loopback), which makes the probe fail for a domain
   * that the CA can reach perfectly well. Treating that as fatal would block all
   * issuance, which is worse than the wasted attempt it would save, so those
   * cases proceed and let the CA be the judge.
   */
  blocking: boolean;
  /** One sentence naming the cause, safe to show an operator or a tenant. */
  detail: string;
}

/** Matches the CA's own patience for a single validation request. */
const TIMEOUT_MS = 8000;

export async function checkChallengeReachability(
  hostname: string,
): Promise<ChallengeReachability> {
  // Shaped like a real ACME token (base64url, high entropy) so nothing along the
  // path can treat it as a special case.
  const token = `preflight-${randomBytes(24).toString("base64url")}`;
  const expected = randomBytes(32).toString("base64url");

  const url = `http://${hostname}/.well-known/acme-challenge/${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    await acmeChallengeStore.put(token, expected, hostname);

    const res = await fetch(url, {
      signal: controller.signal,
      // The CA does follow redirects, but a redirect to HTTPS before a
      // certificate exists is a broken setup we want to name explicitly rather
      // than follow into a TLS error.
      redirect: "manual",
      headers: { "User-Agent": "GReviewPilot-AcmePreflight/1.0" },
      cache: "no-store",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") ?? "(no Location header)";
      return {
        reachable: false,
        blocking: true,
        detail:
          `Port 80 redirects the ACME validation path (${res.status} -> ${location}). ` +
          "Let's Encrypt must be able to read it over plain HTTP. Remove any " +
          "blanket HTTP-to-HTTPS redirect for /.well-known/acme-challenge/ — if the " +
          "domain is proxied through Cloudflare, turn off \"Always Use HTTPS\" or set " +
          "the DNS record to DNS-only.",
      };
    }

    const body = (await res.text()).trim();

    if (res.ok && body === expected) {
      return {
        reachable: true,
        blocking: false,
        detail: "The ACME validation path is reachable over HTTP.",
      };
    }

    // Who answered matters more than the status code. Our own route replies
    // `Not found` as text/plain; nginx's `return 404` replies with an HTML error
    // page and a `Server: nginx` header. Those are completely different faults —
    // the first means the token lookup failed, the second means the request never
    // reached the app — and reporting them with one message sent debugging in the
    // wrong direction for a long time.
    const server = res.headers.get("server");
    const fromApp = /^not found/i.test(body) && !/<html/i.test(body);
    const origin = server ? ` Answered by "${server}"` : "";

    if (res.status === 404) {
      if (fromApp) {
        return {
          reachable: false,
          blocking: true,
          detail:
            "The request reached this app, but the challenge token was not found. " +
            "The app is being served from a different database or process than the one " +
            "that stored the token — check that pm2 and the CLI load the same .env.",
        };
      }
      return {
        reachable: false,
        blocking: true,
        detail:
          "The ACME validation path returned 404 from a web server that is not this app." +
          `${origin}. nginx is matching a different server block for this hostname — ` +
          "usually because its vhost directory is not in nginx's effective config, or " +
          "another site already claims the hostname. Run: " +
          "npm run ssl:provision -- --nginx <hostname>",
      };
    }

    return {
      reachable: false,
      blocking: true,
      detail: res.ok
        ? "Something answered the ACME validation path, but not this deployment — " +
          `the domain is pointing at a different server or site.${origin}`
        : `The ACME validation path returned ${res.status}.${origin}`,
    };
  } catch (err) {
    // Inconclusive, not fatal. See `blocking` above: a server that cannot reach
    // its own public address is common and harmless.
    const aborted = err instanceof Error && err.name === "AbortError";
    logger.debug("ACME preflight inconclusive", {
      hostname,
      err: aborted ? "timeout" : String(err),
    });
    return {
      reachable: false,
      blocking: false,
      detail: aborted
        ? "Could not confirm the ACME validation path from this server (timed out). Attempting issuance anyway."
        : "Could not confirm the ACME validation path from this server. Attempting issuance anyway.",
    };
  } finally {
    clearTimeout(timer);
    await acmeChallengeStore.remove(token);
  }
}
