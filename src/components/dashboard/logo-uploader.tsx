"use client";

/**
 * Drop-in logo/cover uploader.
 *
 * Uploads to /api/private/media/upload with a caller-supplied
 * `attachTo` hint so the media service wires the new asset onto the
 * target entity (Tenant.logo / BusinessProfile.coverImage / User.avatar).
 * Emits `onUploaded(mediaId, url)` on success so the parent can update
 * local state without a full page reload.
 */

import Image from "next/image";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { mediaApi } from "@/lib/api";

export function LogoUploader({
  value,
  category,
  attachTo,
  aspect = "square",
  height = 96,
  onUploaded,
}: {
  value: string | null;
  category: "LOGO" | "COVER" | "AVATAR";
  attachTo: "tenantLogo" | "profileCover" | "userAvatar";
  aspect?: "square" | "banner";
  height?: number;
  onUploaded: (mediaId: string, url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // Whenever `value` (a MediaAsset id) changes, fetch its metadata to
  // get a signed URL for display.
  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setPreview(null);
      return;
    }
    mediaApi
      .get(value)
      .then((m) => {
        if (!cancelled) setPreview(m.url);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const asset = await mediaApi.upload(file, { category, attachTo });
      onUploaded(asset.id, asset.url);
      setPreview(asset.url);
      toast.success("Uploaded");
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const dims =
    aspect === "banner"
      ? { width: 320, height }
      : { width: height, height };

  return (
    <div className="flex items-center gap-3">
      <div
        className="relative flex overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shrink-0"
        style={{ width: dims.width, height: dims.height }}
      >
        {preview ? (
          <Image
            src={preview}
            alt=""
            width={dims.width}
            height={dims.height}
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-slate-400">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Uploading…" : preview ? "Replace" : "Upload"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          className="hidden"
        />
        <div className="text-[11px] text-slate-500">PNG, JPG, WebP, up to 25MB</div>
      </div>
    </div>
  );
}
