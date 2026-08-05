/**
 * Verifies the TLS certificate inspector against known-good and known-bad
 * endpoints.
 *
 * Uses badssl.com, which exists to serve deliberately broken TLS
 * configurations, plus a couple of real sites. Without this the inspector's
 * verdicts are untestable assertions — and a false "valid" would tell a tenant
 * their site is secure when browsers will warn on it.
 *
 * Needs outbound network access. Run with: npm run verify:tls
 */

// The service tree validates env at import time, so .env has to be in
// process.env before the module loads. Static imports hoist above statements,
// hence the dynamic import below.
try {
  process.loadEnvFile(".env");
} catch {
  // Already-populated environments (CI) are fine.
}

const { certificateCoversHostname, inspectCertificate } = await import(
  "../src/server/services/tlsCertificate.service"
);
const { checkCaa } = await import("../src/server/services/siteDomain.service");

interface Case {
  hostname: string;
  expectValid: boolean;
  expectProblem?: string;
  why: string;
}

const CASES: Case[] = [
  { hostname: "example.com", expectValid: true, why: "ordinary valid certificate" },
  { hostname: "badssl.com", expectValid: true, why: "valid certificate on the test host itself" },
  {
    hostname: "expired.badssl.com",
    expectValid: false,
    expectProblem: "expired",
    why: "certificate past its validTo",
  },
  {
    hostname: "wrong.host.badssl.com",
    expectValid: false,
    expectProblem: "hostname_mismatch",
    why: "certificate does not cover the requested name",
  },
  {
    hostname: "self-signed.badssl.com",
    expectValid: false,
    expectProblem: "untrusted",
    why: "self-signed, no trusted chain",
  },
  {
    hostname: "untrusted-root.badssl.com",
    expectValid: false,
    expectProblem: "untrusted",
    why: "chain terminates at an untrusted root",
  },
  {
    hostname: "this-domain-really-should-not-exist-gr.com",
    expectValid: false,
    expectProblem: "unreachable",
    why: "nothing answers HTTPS",
  },
];

/** Pure wildcard-matching checks — no network, so these must always hold. */
function unitChecks(): number {
  const cases: Array<[string, string[], boolean]> = [
    ["example.com", ["example.com"], true],
    ["www.example.com", ["*.example.com"], true],
    ["example.com", ["*.example.com"], false],
    ["a.b.example.com", ["*.example.com"], false],
    ["a.b.example.com", ["*.b.example.com"], true],
    ["EXAMPLE.com", ["example.com"], true],
    ["example.com", ["example.com."], true],
    ["other.com", ["example.com", "*.example.com"], false],
    ["example.com", [], false],
  ];

  let failures = 0;
  console.log("Hostname coverage (offline):");
  for (const [host, names, expected] of cases) {
    const actual = certificateCoversHostname(host, names);
    const ok = actual === expected;
    if (!ok) failures += 1;
    console.log(`  ${ok ? "+" : "x"} ${host.padEnd(20)} vs ${JSON.stringify(names).padEnd(30)} -> ${actual}`);
  }
  return failures;
}

async function main() {
  let failures = unitChecks();

  console.log("\nLive endpoints:");
  for (const testCase of CASES) {
    const report = await inspectCertificate(testCase.hostname, { timeoutMs: 12000 });

    const validOk = report.valid === testCase.expectValid;
    const problemOk =
      !testCase.expectProblem || report.problems.includes(testCase.expectProblem as never);
    const ok = validOk && problemOk;
    if (!ok) failures += 1;

    console.log(
      `  ${ok ? "+" : "x"} ${testCase.hostname.padEnd(42)} valid=${String(report.valid).padEnd(5)} ` +
        `problems=[${report.problems.join(",")}] issuer=${report.issuer ?? "-"}`,
    );
    if (!ok) {
      console.log(
        `      expected valid=${testCase.expectValid}` +
          (testCase.expectProblem ? ` problem=${testCase.expectProblem}` : "") +
          ` (${testCase.why})`,
      );
    }
  }

  // A valid certificate must always carry usable lifecycle data, otherwise
  // expiry monitoring silently has nothing to monitor.
  const good = await inspectCertificate("example.com", { timeoutMs: 12000 });
  const lifecycleOk =
    good.validFrom instanceof Date &&
    good.validTo instanceof Date &&
    typeof good.daysUntilExpiry === "number" &&
    good.daysUntilExpiry > 0 &&
    good.altNames.length > 0;
  if (!lifecycleOk) failures += 1;
  console.log(
    `\n  ${lifecycleOk ? "+" : "x"} lifecycle data present: from=${good.validFrom?.toISOString().slice(0, 10)} ` +
      `to=${good.validTo?.toISOString().slice(0, 10)} days=${good.daysUntilExpiry} names=${good.altNames.length}`,
  );

  failures += await caaChecks();

  console.log(failures === 0 ? "\nAll TLS checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

/**
 * CAA preflight, against domains with long-standing published policies.
 *
 * google.com has allowed only pki.goog for years, which makes it a stable
 * negative case for a Let's Encrypt-issued platform. www.google.com is the
 * inheritance case: it publishes no CAA of its own, so a correct implementation
 * must walk up and be governed by google.com.
 */
async function caaChecks(): Promise<number> {
  const cases: Array<{
    hostname: string;
    expectPresent: boolean;
    expectPermitted: boolean;
    expectFoundAt?: string;
    why: string;
  }> = [
    {
      hostname: "google.com",
      expectPresent: true,
      expectPermitted: false,
      expectFoundAt: "google.com",
      why: "CAA allows only pki.goog, so Let's Encrypt cannot issue",
    },
    {
      hostname: "www.google.com",
      expectPresent: true,
      expectPermitted: false,
      expectFoundAt: "google.com",
      why: "no CAA of its own — must inherit the parent zone's policy",
    },
    {
      hostname: "example.com",
      expectPresent: false,
      expectPermitted: true,
      why: "no CAA anywhere means any CA may issue",
    },
  ];

  let failures = 0;
  console.log("\nCAA preflight:");
  for (const testCase of cases) {
    const result = await checkCaa(testCase.hostname);
    const ok =
      result.present === testCase.expectPresent &&
      result.permitted === testCase.expectPermitted &&
      (!testCase.expectFoundAt || result.foundAt === testCase.expectFoundAt);
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? "+" : "x"} ${testCase.hostname.padEnd(18)} present=${String(result.present).padEnd(5)} ` +
        `permitted=${String(result.permitted).padEnd(5)} at=${result.foundAt ?? "-"}`,
    );
    if (!ok) console.log(`      expected: ${testCase.why}`);
  }
  return failures;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
