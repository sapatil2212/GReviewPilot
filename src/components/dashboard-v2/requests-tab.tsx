"use client";

import { useState } from "react";
import { QrCode, Copy, Check, Download } from "lucide-react";

interface RequestsTabProps {
  onTriggerToast: (msg: string) => void;
}

export function RequestsTab({ onTriggerToast }: RequestsTabProps) {
  const [copied, setCopied] = useState(false);

  const reviewLink = "https://g.page/r/acmedentalcare/review";

  const handleCopy = () => {
    navigator.clipboard.writeText(reviewLink);
    setCopied(true);
    onTriggerToast("Google Review link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Review Request & Campaign Studio</h2>
        <p className="text-xs text-slate-500">
          Generate branded QR codes, automated SMS review invites, and smart review funnel links.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* QR Code Generator Box */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <QrCode className="h-5 w-5 text-blue-600" />
              Smart QR Review Flyer Generator
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Print this QR code on table stands, receipts, and appointment cards.
            </p>

            <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6">
              <div className="relative flex h-40 w-40 items-center justify-center rounded-2xl bg-white p-4 shadow-md">
                {/* Simulated QR Code Canvas */}
                <div className="grid grid-cols-5 gap-1.5 h-full w-full p-2 bg-slate-900 rounded-lg">
                  {Array.from({ length: 25 }).map((_, i) => (
                    <div
                      key={i}
                      className={
                        "rounded-xs " +
                        (i % 2 === 0 ? "bg-white" : i % 3 === 0 ? "bg-blue-400" : "bg-slate-900")
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="mt-3 text-xs font-bold text-slate-800">Scan to Review Acme Dental Care</div>
              <div className="text-[10.5px] text-slate-400">Directs happy customers to Google 5★ page</div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => onTriggerToast("Downloading high-res QR flyer PDF...")}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700"
            >
              <Download className="h-4 w-4" /> Download QR Flyer PDF
            </button>
          </div>
        </div>

        {/* Short Review Link & SMS Preview */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Direct Google Review Link</h3>
            <p className="text-xs text-slate-500 mb-3">Share this link directly via WhatsApp or Email</p>

            <div className="flex items-center gap-2">
              <input
                readOnly
                type="text"
                value={reviewLink}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700 outline-none"
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Automated SMS Preview</h3>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-100 p-4 font-sans text-xs text-slate-800">
              &ldquo;Hi Sarah! Thank you for visiting Acme Dental Care today. We&apos;d love to hear your feedback! Tap here to leave a quick Google review: <span className="text-blue-600 underline">{reviewLink}</span>&rdquo;
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
