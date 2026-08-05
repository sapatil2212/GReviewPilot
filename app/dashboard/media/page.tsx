"use client";

/**
 * /dashboard/media — Media Library.
 *
 * Grid of previews with filters (category, kind, visibility), search,
 * pagination, per-file selection, bulk delete, and a usage bar showing
 * storage consumption vs the tenant cap.
 */

import Image from "next/image";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ImageIcon, Search, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Field, Input, Select } from "@/components/dashboard/field";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { useApi } from "@/lib/api/useApi";
import { mediaApi, type MediaAssetDto } from "@/lib/api";
import { UploadDialog } from "./_components/upload-dialog";

const CATEGORIES = [
  "",
  "LOGO",
  "COVER",
  "AVATAR",
  "GALLERY",
  "BUSINESS_PHOTO",
  "POST_MEDIA",
  "REVIEW_MEDIA",
  "QR_ASSET",
  "DOCUMENT",
  "OTHER",
];
const KINDS = ["", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "OTHER"];
const VISIBILITIES = ["", "PRIVATE", "PUBLIC"];

export default function MediaLibraryPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState("");
  const [visibility, setVisibility] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmOne, setConfirmOne] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const list = useApi(
    () =>
      mediaApi.list({
        page,
        pageSize: 24,
        search: search.trim() || undefined,
        category: category || undefined,
        kind: kind || undefined,
        visibility: visibility || undefined,
        sortBy: "createdAt",
        sortDir: "desc",
      }),
    [page, search, category, kind, visibility],
  );

  const stats = useApi(() => mediaApi.stats(), []);

  function toggleAllOnPage() {
    if (!list.data) return;
    const idsOnPage = list.data.items.map((i) => i.id);
    const allSelected = idsOnPage.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of idsOnPage) next.delete(id);
      } else {
        for (const id of idsOnPage) next.add(id);
      }
      return next;
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refresh() {
    await Promise.all([list.refresh(), stats.refresh()]);
  }

  async function handleBulkDelete() {
    setBusy(true);
    try {
      const ids = [...selected];
      const { removedCount } = await mediaApi.bulkRemove(ids);
      toast.success(`Removed ${removedCount} file${removedCount === 1 ? "" : "s"}`);
      setSelected(new Set());
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
      setConfirmBulk(false);
    }
  }

  async function handleDeleteOne() {
    if (!confirmOne) return;
    setBusy(true);
    try {
      await mediaApi.remove(confirmOne.id);
      toast.success("File removed");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(confirmOne.id);
        return next;
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
      setConfirmOne(null);
    }
  }

  const usagePercent = stats.data?.usagePercent ?? 0;
  const usageBytes = stats.data ? BigInt(stats.data.totalBytes) : 0n;
  const capBytes = stats.data ? BigInt(stats.data.capBytes) : 0n;

  return (
    <>
      <PageHeader
        title="Media Library"
        description="All files uploaded to this workspace — logos, gallery, documents, and post assets."
        actions={
          <>
            {selected.size > 0 && (
              <button
                onClick={() => setConfirmBulk(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete {selected.size}
              </button>
            )}
            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </button>
          </>
        }
      />

      {/* Usage */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between text-xs">
          <div>
            <div className="font-semibold text-slate-900">Storage used</div>
            <div className="text-slate-500">
              {formatBytes(usageBytes)} of {formatBytes(capBytes)} ·{" "}
              {usagePercent.toFixed(1)}%
            </div>
          </div>
          <div className="text-slate-500">
            {(stats.data?.byCategory.length ?? 0)} categor
            {stats.data?.byCategory.length === 1 ? "y" : "ies"}
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={
              "h-full " +
              (usagePercent > 90
                ? "bg-red-500"
                : usagePercent > 70
                  ? "bg-amber-500"
                  : "bg-emerald-500")
            }
            style={{ width: `${Math.min(100, usagePercent)}%` }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Filename, alt text, caption"
                className="pl-8"
              />
            </div>
          </Field>
          <Field label="Category">
            <Select
              value={category}
              onChange={(e) => {
                setPage(1);
                setCategory(e.target.value);
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c || "All"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kind">
            <Select
              value={kind}
              onChange={(e) => {
                setPage(1);
                setKind(e.target.value);
              }}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k || "All"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Visibility">
            <Select
              value={visibility}
              onChange={(e) => {
                setPage(1);
                setVisibility(e.target.value);
              }}
            >
              {VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {v || "All"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        {list.loading ? (
          <div className="p-6 text-sm text-slate-500">Loading…</div>
        ) : (list.data?.items.length ?? 0) === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={ImageIcon}
              title="Media library is empty"
              description="Upload logos, gallery photos, or documents to make them available across the workspace."
              action={
                <button
                  onClick={() => setUploadOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </button>
              }
            />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={
                    list.data!.items.length > 0 &&
                    list.data!.items.every((i) => selected.has(i.id))
                  }
                  onChange={toggleAllOnPage}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Select all on page
              </label>
              <span>{selected.size} selected</span>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {list.data!.items.map((m) => (
                <MediaTile
                  key={m.id}
                  asset={m}
                  selected={selected.has(m.id)}
                  onToggle={() => toggle(m.id)}
                  onDelete={() =>
                    setConfirmOne({ id: m.id, name: m.filename })
                  }
                />
              ))}
            </div>
            <PaginationBar
              page={list.data!.page}
              pageSize={list.data!.pageSize}
              total={list.data!.total}
              totalPages={list.data!.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={refresh}
      />
      <ConfirmDialog
        open={confirmBulk}
        title={`Delete ${selected.size} file${selected.size === 1 ? "" : "s"}?`}
        description="Files are soft-deleted and pinned references (logos, covers, avatars) will be cleared automatically."
        destructive
        confirmLabel="Delete"
        loading={busy}
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulk(false)}
      />
      <ConfirmDialog
        open={!!confirmOne}
        title={`Delete ${confirmOne?.name ?? ""}?`}
        description="Soft-deleted. Retained for recovery; permanent deletion happens later by a background job."
        destructive
        confirmLabel="Delete"
        loading={busy}
        onConfirm={handleDeleteOne}
        onCancel={() => setConfirmOne(null)}
      />
    </>
  );
}

function MediaTile({
  asset,
  selected,
  onToggle,
  onDelete,
}: {
  asset: MediaAssetDto;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isImage = asset.kind === "IMAGE";
  return (
    <div
      className={
        "group relative overflow-hidden rounded-xl border bg-white transition " +
        (selected
          ? "border-blue-500 ring-2 ring-blue-500/30"
          : "border-slate-200 hover:border-slate-300")
      }
    >
      <button
        onClick={onToggle}
        className={
          "absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-md border transition " +
          (selected
            ? "border-blue-500 bg-blue-500 text-white"
            : "border-slate-300 bg-white/80 opacity-0 group-hover:opacity-100")
        }
        aria-label={selected ? "Deselect" : "Select"}
      >
        {selected && <Check className="h-3 w-3" />}
      </button>
      <button
        onClick={onDelete}
        className="absolute right-2 top-2 z-10 rounded-md bg-white/80 p-1 text-slate-500 opacity-0 transition hover:bg-red-500 hover:text-white group-hover:opacity-100"
        aria-label="Delete"
      >
        <Trash2 className="h-3 w-3" />
      </button>
      <div className="flex aspect-square items-center justify-center bg-slate-50">
        {isImage ? (
          <Image
            src={asset.url}
            alt={asset.altText ?? asset.filename}
            width={256}
            height={256}
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-xs font-medium text-slate-500">
            <FileGlyph kind={asset.kind} />
            <span className="uppercase">{asset.kind}</span>
          </div>
        )}
      </div>
      <div className="p-2">
        <div className="truncate text-[11px] font-semibold text-slate-900">
          {asset.filename}
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <span>{asset.category}</span>
          <span>{formatBytes(BigInt(asset.sizeBytes))}</span>
        </div>
      </div>
    </div>
  );
}

function FileGlyph({ kind }: { kind: string }) {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-[10px] font-bold text-slate-500">
      {kind.slice(0, 3)}
    </div>
  );
}

function formatBytes(bytes: bigint): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}
