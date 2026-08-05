/**
 * Template preview renderer.
 *
 * Deliberately a top-level route rather than a page under /dashboard: it is
 * loaded inside an iframe by the template gallery, so it must render bare —
 * the dashboard layout's sidebar and max-width container would appear inside
 * every preview frame.
 *
 * Uses the same `SiteRenderer` as the public site so the preview is a true
 * representation of what "Use this template" produces. Session-protected
 * because the gallery is a logged-in surface; noindex because these are
 * demo-content pages that must never compete with tenants' real sites in
 * search results.
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { tryGetSession } from "@/server/auth/requireSession";
import { can } from "@/server/permissions/permissions";
import { siteTemplatePreviewService } from "@/server/services/siteTemplatePreview.service";
import { googleFontsHref } from "@/site/document/theme";
import { SiteRenderer } from "@/site/render/SiteRenderer";

interface PreviewPageProps {
  params: Promise<{ slug: string; path?: string[] }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Template preview",
  robots: { index: false, follow: false },
};

function pathFrom(segments?: string[]): string {
  if (!segments || segments.length === 0) return "/";
  return `/${segments.join("/")}`;
}

export default async function TemplatePreviewPage({ params }: PreviewPageProps) {
  const { slug, path } = await params;

  const ctx = await tryGetSession();
  if (!ctx) redirect(`/auth?callbackUrl=/dashboard/website`);
  if (!can(ctx.role, "site:read")) redirect("/dashboard");

  const preview = await siteTemplatePreviewService.load(slug, pathFrom(path));
  if (!preview) notFound();

  const fontsHref = googleFontsHref(preview.ctx.theme);

  return (
    <>
      {fontsHref && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsHref} />
        </>
      )}
      <SiteRenderer ctx={preview.ctx} />
    </>
  );
}
