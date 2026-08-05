"use client";

/**
 * /dashboard/reviews/funnel
 *
 * Shows the review funnel link for each location + QR code placeholder.
 * The link is: {APP_URL}/review/{tenant-slug}/{location-slug}
 */

import { ClipboardCopy, ExternalLink, Link2, QrCode, X, Download, Sparkles } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useApi } from "@/lib/api/useApi";
import { locationsApi, reviewsApi, type LocationDto } from "@/lib/api";
import { apiFetch } from "@/lib/fetcher";
import { ReviewProfileEditor } from "./_components/review-profile-editor";

export default function ReviewFunnelLinksPage() {
  const { data: session } = useApi(async () => {
    const r = await apiFetch<{
      user: { id: string };
      tenant: { slug: string } | null;
    }>("/api/auth/me");
    return r.data;
  }, []);

  const locations = useApi(
    () => locationsApi.list({ pageSize: 100, status: "ACTIVE", sortBy: "name", sortDir: "asc" }),
    [],
  );

  const tenantSlug = session?.tenant?.slug;

  const [qrFor, setQrFor] = useState<LocationDto | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [aiFor, setAiFor] = useState<LocationDto | null>(null);

  function buildLink(loc: LocationDto): string {
    return `${window.location.origin}/review/${tenantSlug}/${loc.slug}`;
  }

  async function copyLink(loc: LocationDto) {
    try {
      await navigator.clipboard.writeText(buildLink(loc));
      toast.success(`Link copied for ${loc.name}`);
    } catch {
      toast.error("Copy failed — try manually");
    }
  }

  async function openQr(loc: LocationDto) {
    setQrFor(loc);
    setQrDataUrl(null);
    setQrLoading(true);
    try {
      const { dataUrl } = await reviewsApi.funnelQr(loc.id);
      setQrDataUrl(dataUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "QR generation failed");
      setQrFor(null);
    } finally {
      setQrLoading(false);
    }
  }

  function downloadQr(loc: LocationDto) {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `review-qr-${loc.slug}.png`;
    a.click();
  }

  return (
    <>
      <PageHeader
        title="AI Review Funnel"
        description="Share these links via QR code, WhatsApp, email, or in-store signage. Each customer is guided through the AI review generator — which drafts a unique review from your business profile — and sent straight to Google."
        breadcrumbs={[{ label: "AI Review Funnel" }]}
      />

      {!tenantSlug ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : (locations.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={Link2}
          title="No active locations"
          description="Create a location first, then you'll get a review funnel link for each one."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {locations.data!.items.map((loc) => {
            const link = buildLink(loc);
            const hasPlaceId = !!loc.googlePlaceId;
            return (
              <div
                key={loc.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="mb-2">
                  <div className="text-sm font-semibold text-slate-900">
                    {loc.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {loc.city}, {loc.country}
                  </div>
                </div>

                {!hasPlaceId && (
                  <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                    ⚠️ No Google Place ID linked. Go to{" "}
                    <a
                      href="/dashboard/integrations/google"
                      className="font-semibold underline"
                    >
                      Integrations
                    </a>{" "}
                    to link this location.
                  </div>
                )}

                <div className="mb-3 break-all rounded-lg border border-slate-100 bg-slate-50 p-2 font-mono text-[10px] text-slate-700">
                  {link}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => copyLink(loc)}
                    disabled={!hasPlaceId}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <ClipboardCopy className="h-3 w-3" /> Copy
                  </button>
                  <button
                    onClick={() => openQr(loc)}
                    disabled={!hasPlaceId}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <QrCode className="h-3 w-3" /> QR
                  </button>
                  <button
                    onClick={() => setAiFor(loc)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <Sparkles className="h-3 w-3" /> AI
                  </button>
                  <a
                    href={hasPlaceId ? link : "#"}
                    target="_blank"
                    rel="noopener"
                    className={
                      "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-semibold " +
                      (hasPlaceId
                        ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        : "pointer-events-none border-slate-200 bg-slate-50 text-slate-400")
                    }
                  >
                    <ExternalLink className="h-3 w-3" /> Preview
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QR modal */}
      {qrFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {qrFor.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Scan to leave a review
                </p>
              </div>
              <button
                onClick={() => setQrFor(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-center rounded-xl border border-slate-100 bg-white p-4">
              {qrLoading || !qrDataUrl ? (
                <div className="flex h-56 w-56 items-center justify-center text-xs text-slate-400">
                  Generating…
                </div>
              ) : (
                <Image
                  src={qrDataUrl}
                  alt={`QR code for ${qrFor.name}`}
                  width={224}
                  height={224}
                  unoptimized
                  className="h-56 w-56"
                />
              )}
            </div>

            <button
              onClick={() => downloadQr(qrFor)}
              disabled={!qrDataUrl}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              Download PNG
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Print it for your counter, table tents, or receipts.
            </p>
          </div>
        </div>
      )}

      {/* AI review profile editor */}
      {aiFor && (
        <ReviewProfileEditor location={aiFor} onClose={() => setAiFor(null)} />
      )}
    </>
  );
}
