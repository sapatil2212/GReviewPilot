"use client";

/**
 * Image field used by the Inspector for every `kind: "image"` prop
 * (hero images, logos, gallery slides, backgrounds, etc.).
 *
 * Lets the user either upload a file from their machine (stored under
 * MediaCategory.WEBSITE_MEDIA, on the dedicated WEBSITE_MEDIA_PATH disk
 * root — see src/server/storage/localStorage.ts) or paste a URL directly.
 * Uploads are signed with a long-lived URL because the result is written
 * straight into SitePage.document JSON and never re-fetched through the
 * media API before display.
 */

import { useRef, useState } from "react";
import { ImageOff, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { mediaApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ImageField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [broken, setBroken] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const asset = await mediaApi.upload(file, {
        category: "WEBSITE_MEDIA",
        visibility: "PUBLIC",
      });
      onChange(asset.url);
      setBroken(false);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "relative flex h-20 w-full items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50",
        )}
      >
        {value && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview only, source is tenant-chosen at runtime.
          <img
            src={value}
            alt=""
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageOff className="h-4 w-4 text-slate-300" />
        )}

        {value && (
          <button
            type="button"
            title="Remove image"
            onClick={() => {
              onChange("");
              setBroken(false);
            }}
            className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-slate-500 shadow hover:text-red-600"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onPick}
        className="hidden"
      />

      <input
        type="text"
        value={value}
        placeholder={placeholder ?? "https://…"}
        onChange={(e) => {
          onChange(e.target.value);
          setBroken(false);
        }}
        className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[11px] focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
