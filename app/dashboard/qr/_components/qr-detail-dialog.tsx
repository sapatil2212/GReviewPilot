"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, ExternalLink, Loader2, X } from "lucide-react";
import { qrApi, type QrCodeDto, type QrAnalyticsDto } from "@/lib/api";

export function QrDetailDialog({
  qr,
  onClose,
}: {
  qr: QrCodeDto;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<QrAnalyticsDto | null>(null);

  useEffect(() => {
    qrApi.image(qr.id).then((r) => setDataUrl(r.dataUrl)).catch(() => {});
    qrApi.analytics(qr.id).then(setAnalytics).catch(() => {});
  }, [qr.id]);

  function download() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${qr.shortCode}.png`;
    a.click();
  }

  const maxDaily = Math.max(1, ...(analytics?.daily.map((d) => d.count) ?? [1]));

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="my-4 w-full max-w-2xl rounded-2xl bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{qr.label}</h3>
            <p className="text-xs text-slate-500">{qr.type.replaceAll("_", " ")}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
          {/* QR + download */}
          <div>
            <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-white p-3">
              {dataUrl ? (
                <Image src={dataUrl} alt="QR" width={190} height={190} unoptimized className="h-48 w-48" />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                </div>
              )}
            </div>
            <button
              onClick={download}
              disabled={!dataUrl}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" /> Download PNG
            </button>
            <a
              href={qr.targetUrl}
              target="_blank"
              rel="noopener"
              className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ExternalLink className="h-3 w-3" /> Test target
            </a>
          </div>

          {/* Stats */}
          <div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Total scans" value={qr.scanCount} />
              <Stat label="Unique scans" value={qr.uniqueScanCount} />
            </div>

            {/* Daily sparkline */}
            <div className="mt-3">
              <div className="mb-1 text-[11px] font-semibold text-slate-500">
                Last 30 days
              </div>
              <div className="flex h-16 items-end gap-0.5">
                {(analytics?.daily ?? []).length === 0 ? (
                  <div className="text-[11px] text-slate-400">No scans yet</div>
                ) : (
                  analytics!.daily.map((d) => (
                    <div
                      key={d.day}
                      title={`${d.day}: ${d.count}`}
                      className="flex-1 rounded-t bg-blue-400"
                      style={{ height: `${(d.count / maxDaily) * 100}%` }}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Device + country */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Breakdown title="By device" rows={analytics?.byDevice.map((d) => ({ label: d.device, count: d.count })) ?? []} />
              <Breakdown title="By country" rows={analytics?.byCountry.map((c) => ({ label: c.country, count: c.count })) ?? []} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
}) {
  return (
    <div className="rounded-xl border border-slate-100 p-2.5">
      <div className="mb-1 text-[11px] font-semibold text-slate-500">{title}</div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-slate-400">—</div>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 5).map((r) => (
            <li key={r.label} className="flex justify-between text-[11px] text-slate-700">
              <span className="capitalize">{r.label}</span>
              <span className="font-semibold">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
