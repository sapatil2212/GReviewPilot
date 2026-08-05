"use client";

/**
 * /dashboard/qr — QR Code manager.
 * Dynamic, trackable QR codes for Google reviews, website, WhatsApp,
 * social, menu, or custom links. Shows scan counts + per-QR analytics.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Plus, QrCode, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Field, Input, Select } from "@/components/dashboard/field";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { useApi } from "@/lib/api/useApi";
import { qrApi, type QrCodeDto } from "@/lib/api";
import { CreateQrDialog } from "./_components/create-qr-dialog";
import { QrDetailDialog } from "./_components/qr-detail-dialog";

const TYPES = ["", "GOOGLE_REVIEW", "WEBSITE", "WHATSAPP", "SOCIAL_MEDIA", "MENU", "CUSTOM"];
const STATUSES = ["", "ACTIVE", "PAUSED", "ARCHIVED"];

export default function QrCodesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<QrCodeDto | null>(null);
  const [toDelete, setToDelete] = useState<QrCodeDto | null>(null);

  const list = useApi(
    () =>
      qrApi.list({
        page,
        pageSize: 12,
        search: search.trim() || undefined,
        type: type || undefined,
        status: status || undefined,
        sortBy: "createdAt",
        sortDir: "desc",
      }),
    [page, search, type, status],
  );
  const stats = useApi(() => qrApi.stats(), []);

  async function refresh() {
    await Promise.all([list.refresh(), stats.refresh()]);
  }

  async function handleDelete() {
    if (!toDelete) return;
    try {
      await qrApi.remove(toDelete.id);
      toast.success("QR code deleted");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setToDelete(null);
    }
  }

  const s = stats.data;

  return (
    <>
      <PageHeader
        title="QR Codes"
        description="Dynamic, trackable QR codes. Change the destination anytime without reprinting."
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" /> New QR code
          </button>
        }
      />

      {s && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <StatCard label="QR codes" value={s.totalCodes} />
          <StatCard label="Total scans" value={s.totalScans} />
          <StatCard label="Unique scans" value={s.totalUniqueScans} />
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Label or target"
                className="pl-8"
              />
            </div>
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => { setPage(1); setType(e.target.value); }}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t ? t.replaceAll("_", " ") : "All"}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
              {STATUSES.map((s2) => (
                <option key={s2} value={s2}>{s2 || "All"}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {list.loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading…
        </div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <EmptyState
            icon={QrCode}
            title="No QR codes yet"
            description="Create a QR code for Google reviews, your website, WhatsApp, or anything else."
            action={
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" /> New QR code
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.data!.items.map((qr) => (
              <div
                key={qr.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {qr.label}
                    </div>
                    <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {qr.type.replaceAll("_", " ")}
                    </span>
                  </div>
                  <button
                    onClick={() => setToDelete(qr)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 truncate text-[11px] text-slate-500">
                  {qr.location ? `📍 ${qr.location.name} · ` : ""}
                  {qr.targetUrl}
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex gap-3 text-center">
                    <div>
                      <div className="text-sm font-bold text-slate-900">{qr.scanCount}</div>
                      <div className="text-[10px] text-slate-500">scans</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{qr.uniqueScanCount}</div>
                      <div className="text-[10px] text-slate-500">unique</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setDetail(qr)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    View & download
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white">
            <PaginationBar
              page={list.data!.page}
              pageSize={list.data!.pageSize}
              total={list.data!.total}
              totalPages={list.data!.totalPages}
              onPageChange={setPage}
            />
          </div>
        </>
      )}

      <CreateQrDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={refresh} />
      {detail && <QrDetailDialog qr={detail} onClose={() => setDetail(null)} />}
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete "${toDelete?.label}"?`}
        description="The QR code will stop working immediately. This can't be undone."
        destructive
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
