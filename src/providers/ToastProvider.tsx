"use client";

/**
 * Sonner toaster mounted once at the app root. All UI code calls
 * `toast()` from "sonner" directly.
 */

import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "rounded-xl border border-border/70 bg-background shadow-elevated",
        },
      }}
    />
  );
}
