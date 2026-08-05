/**
 * Verifies every curated image ID in src/site/ai/imagery.ts resolves.
 *
 * Exists because a broken image URL is invisible at build time and at type
 * level — it only shows up as an empty box on a tenant's live website. The
 * original implementation shipped a URL pattern that 404'd for every image in
 * every template, and nothing in the pipeline caught it. This does.
 *
 * Run with: npm run verify:imagery
 */

import { allImageIds, unsplashUrl } from "../src/site/ai/imagery";

// Modest concurrency plus retries: the CDN throttles bursts, and a connection
// reset from throttling is not the same thing as a missing image. Reporting
// those as failures would train people to ignore this script.
const CONCURRENCY = 4;
const ATTEMPTS = 3;

async function check(id: string): Promise<{ id: string; ok: boolean; status: number | string }> {
  const url = unsplashUrl(id, 400, 300, 60);
  let last: number | string = "no attempt";

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) return { id, ok: true, status: res.status };
      // A 404 is definitive — the photo is gone, so stop retrying.
      if (res.status === 404) return { id, ok: false, status: 404 };
      last = res.status;
    } catch (err) {
      last = err instanceof Error ? err.message : "network error";
    }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 500));
  }

  return { id, ok: false, status: last };
}

async function main() {
  const ids = allImageIds();
  console.log(`Verifying ${ids.length} curated image IDs...\n`);

  const results: Array<{ id: string; ok: boolean; status: number | string }> = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    results.push(...(await Promise.all(ids.slice(i, i + CONCURRENCY).map(check))));
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of failed) console.log(`  x ${r.id} -> ${r.status}`);

  if (failed.length === 0) {
    console.log(`All ${ids.length} images resolved.`);
    return;
  }
  console.log(`\n${failed.length} of ${ids.length} images failed. Replace them in imagery.ts.`);
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
