"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { mediaApi } from "@/lib/api";
import { Field, Input, Select, Textarea } from "@/components/dashboard/field";

const CATEGORIES = [
  "OTHER",
  "GALLERY",
  "BUSINESS_PHOTO",
  "POST_MEDIA",
  "REVIEW_MEDIA",
  "DOCUMENT",
];

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

export function UploadDialog({ open, onClose, onUploaded }: UploadDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("GALLERY");
  const [visibility, setVisibility] = useState("PRIVATE");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  if (!open) return null;

  function reset() {
    setFile(null);
    setAltText("");
    setCaption("");
    setCategory("GALLERY");
    setVisibility("PRIVATE");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      await mediaApi.upload(file, {
        category,
        visibility,
        altText,
        caption,
      });
      toast.success("Uploaded");
      reset();
      onUploaded();
      onClose();
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Upload media
            </h3>
            <p className="text-xs text-slate-500">
              PNG, JPG, WebP, PDF, MP4 and more.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="File" required>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) setFile(dropped);
              }}
              className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500 hover:border-blue-400 hover:bg-blue-50/50"
            >
              <Upload className="h-6 w-6 text-slate-400" />
              {file ? (
                <>
                  <div className="font-semibold text-slate-800">{file.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || "?"}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-semibold text-slate-700">
                    Click to browse or drop a file
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Uploads to your workspace media library
                  </div>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Visibility">
              <Select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                <option value="PRIVATE">Private</option>
                <option value="PUBLIC">Public</option>
              </Select>
            </Field>
          </div>
          <Field label="Alt text" hint={`${altText.length}/500`}>
            <Input
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              maxLength={500}
            />
          </Field>
          <Field label="Caption" hint={`${caption.length}/1000`}>
            <Textarea
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={1000}
            />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
