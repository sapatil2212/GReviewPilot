"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="relative text-center">
        <div className="pointer-events-none absolute -inset-32 bg-mesh opacity-40" />
        <div className="relative">
          <div className="text-[64px] font-bold tracking-tighter text-gradient leading-none">
            Oops
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="mt-3 max-w-md text-muted-foreground">
            An unexpected error occurred. Our team has been notified.
          </p>
          <button
            onClick={reset}
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:-translate-y-0.5"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
