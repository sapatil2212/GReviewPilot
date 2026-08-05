"use client";

/**
 * /dashboard/posts — Google Posts hub.
 *
 * Lists drafts, scheduled, published and failed posts with KPI counts,
 * filters, and the full lifecycle actions (edit, publish, duplicate,
 * delete). Composing supports AI-drafted copy.
 */

import { useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  FileText,
  Megaphone,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Field, Select } from "@/components/dashboard/field";
import { useApi } from "@/lib/api/useApi";
import { locationsApi, postsApi, type GooglePostDto } from "@/lib/api";
import { PostComposer } from "./_components/post-composer";
import { SocialStudio } from "./_components/social-studio";

const STATUS_OPTIONS = ["", "DRAFT", "SCHEDULED", "PUBLISHED", "FAILED"] as const;
const TYPE_OPTIONS = ["", "STANDARD", "EVENT", "OFFER", "ALERT"] as const;

const TYPE_LABEL: Record<string, string> = {
  STANDARD: "What's New",
  EVENT: "Event",
  OFFER: "Offer",
  ALERT: "Alert",
};

export default function PostsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [locationId, setLocationId] = useState("");

  const [tab, setTab] = useState<"google" | "social">("google");
  const [composerFor, setComposerFor] = useState<GooglePostDto | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerBody, setComposerBody] = useState<string | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<GooglePostDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useApi(
    () =>
      postsApi.list({
        page,
        pageSize: 12,
        status: status || undefined,
        type: type || undefined,
        locationId: locationId || undefined,
        sortBy: "createdAt",
        sortDir: "desc",
      }),
    [page, status, type, locationId],
  );
  const stats = useApi(() => postsApi.stats(), []);
  const locations = useApi(
    () => locationsApi.list({ pageSize: 100, status: "ACTIVE", sortBy: "name" }),
    [],
  );

  async function refreshAll() {
    await Promise.all([list.refresh(), stats.refresh()]);
  }

  async function publishNow(p: GooglePostDto) {
    setBusyId(p.id);
    try {
      await postsApi.publish(p.id, { publishNow: true });
      toast.success("Post published");
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(p: GooglePostDto) {
    setBusyId(p.id);
    try {
      await postsApi.duplicate(p.id);
      toast.success("Duplicated as a new draft");
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Duplicate failed");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await postsApi.remove(pendingDelete.id);
      toast.success("Post deleted");
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPendingDelete(null);
    }
  }

  function openNew() {
    setComposerFor(null);
    setComposerBody(undefined);
    setComposerOpen(true);
  }

  function openEdit(p: GooglePostDto) {
    setComposerFor(p);
    setComposerBody(undefined);
    setComposerOpen(true);
  }

  /** Carry a Social Studio caption into the Google post composer. */
  function openFromSocial(body: string) {
    setComposerFor(null);
    setComposerBody(body);
    setComposerOpen(true);
  }

  const s = stats.data;

  // Held as a JSX value rather than a nested component: a function
  // component declared inside the render gets a fresh identity every
  // pass, which would remount the subtree and drop input focus.
  const googlePostsTab = (
    <>
      {/* KPIs */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={FileText} label="Drafts" value={s?.draft ?? 0} accent="blue" />
        <KpiCard
          icon={CalendarClock}
          label="Scheduled"
          value={s?.scheduled ?? 0}
          accent="violet"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Published"
          value={s?.published ?? 0}
          accent="emerald"
        />
        <KpiCard
          icon={TriangleAlert}
          label="Failed"
          value={s?.failed ?? 0}
          accent={(s?.failed ?? 0) > 0 ? "rose" : "emerald"}
        />
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Status">
            <Select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o || "All statuses"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type">
            <Select
              value={type}
              onChange={(e) => {
                setPage(1);
                setType(e.target.value);
              }}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o ? TYPE_LABEL[o] : "All types"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location">
            <Select
              value={locationId}
              onChange={(e) => {
                setPage(1);
                setLocationId(e.target.value);
              }}
            >
              <option value="">All locations</option>
              {locations.data?.items.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.city}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {/* List */}
      {list.loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading posts…
        </div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <EmptyState
            icon={Megaphone}
            title="No posts yet"
            description="Create your first Google post — announce news, run an offer, or promote an event."
            action={
              <button
                onClick={openNew}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                New post
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.data!.items.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                busy={busyId === p.id}
                onEdit={() => openEdit(p)}
                onPublish={() => publishNow(p)}
                onDuplicate={() => duplicate(p)}
                onDelete={() => setPendingDelete(p)}
              />
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
    </>
  );

  return (
    <>
      <PageHeader
        title="Posts"
        description="Publish updates, events, offers, and alerts to your Google Business Profile. Draft with AI, schedule ahead, and reuse what works."
        breadcrumbs={[{ label: "Posts" }]}
        actions={
          tab === "google" ? (
            <button
              onClick={openNew}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              New post
            </button>
          ) : null
        }
      />

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {(
          [
            { key: "google", label: "Google Posts", icon: Megaphone },
            { key: "social", label: "Social Studio", icon: Sparkles },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
                (active
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50")
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "social" ? (
        <SocialStudio
          locations={locations.data?.items ?? []}
          onUseInGooglePost={openFromSocial}
        />
      ) : (
        googlePostsTab
      )}

      {composerOpen && (
        <PostComposer
          post={composerFor}
          locations={locations.data?.items ?? []}
          initialBody={composerBody}
          onClose={() => setComposerOpen(false)}
          onSaved={refreshAll}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this post?"
        description="The post is soft-deleted and can be recovered by an admin."
        destructive
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

function PostCard({
  post,
  busy,
  onEdit,
  onPublish,
  onDuplicate,
  onDelete,
}: {
  post: GooglePostDto;
  busy: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const published = post.status === "PUBLISHED";
  const canEdit = !published && !post.deletedAt;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {TYPE_LABEL[post.type] ?? post.type}
            </span>
            <StatusPill status={post.status} />
          </div>
          {post.title && (
            <div className="mt-2 truncate text-sm font-semibold text-slate-900">
              {post.title}
            </div>
          )}
        </div>
      </div>

      <p className="mt-2 line-clamp-4 text-[11px] leading-relaxed text-slate-600">
        {post.body}
      </p>

      <div className="mt-2.5 space-y-1 text-[11px] text-slate-500">
        <div>{post.location ? post.location.name : "All locations"}</div>
        {post.scheduledAt && !published && (
          <div className="flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            {new Date(post.scheduledAt).toLocaleString()}
          </div>
        )}
        {post.publishedAt && (
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            {new Date(post.publishedAt).toLocaleString()}
          </div>
        )}
        {published && (
          <div>
            {post.viewCount} views · {post.clickCount} clicks
          </div>
        )}
        {post.failReason && (
          <div className="text-rose-600">{post.failReason}</div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
        {canEdit && (
          <button
            onClick={onEdit}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
        {!published && (
          <button
            onClick={onPublish}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          >
            <Send className="h-3 w-3" /> Publish
          </button>
        )}
        <button
          onClick={onDuplicate}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <Copy className="h-3 w-3" /> Duplicate
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: "bg-slate-200 text-slate-700",
    SCHEDULED: "bg-violet-100 text-violet-700",
    PUBLISHED: "bg-emerald-100 text-emerald-700",
    FAILED: "bg-rose-100 text-rose-700",
    DELETED: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
        (map[status] ?? "bg-slate-100 text-slate-600")
      }
    >
      {status}
    </span>
  );
}
