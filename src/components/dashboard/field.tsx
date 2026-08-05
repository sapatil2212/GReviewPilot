"use client";

/**
 * Lightweight form primitives. We deliberately don't reach for
 * react-hook-form here — the pages currently need plain controlled
 * inputs, and this keeps the surface area small. Every field renders
 * an error slot at the bottom for server-side validation feedback.
 */

import type { ReactNode } from "react";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  required,
  className,
  compact,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
  /** Tighter label spacing + smaller text for dense forms. */
  compact?: boolean;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className={
          "flex items-center justify-between font-semibold text-slate-700 " +
          (compact ? "mb-0.5 text-[11px]" : "mb-1 text-xs")
        }
      >
        <span>
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </span>
        {hint && <span className="font-normal text-slate-400">{hint}</span>}
      </label>
      {children}
      {error && (
        <div className="mt-1 text-[11px] font-medium text-red-600">{error}</div>
      )}
    </div>
  );
}

const inputBase =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500";
const inputBaseCompact =
  "w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500";
const inputInvalid =
  "w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20";
const inputInvalidCompact =
  "w-full rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20";

function baseFor(invalid?: boolean, compact?: boolean): string {
  if (invalid) return compact ? inputInvalidCompact : inputInvalid;
  return compact ? inputBaseCompact : inputBase;
}

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    invalid?: boolean;
    compact?: boolean;
  },
) {
  const { invalid, compact, className, ...rest } = props;
  return (
    <input
      {...rest}
      className={baseFor(invalid, compact) + (className ? " " + className : "")}
    />
  );
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    invalid?: boolean;
    compact?: boolean;
  },
) {
  const { invalid, compact, className, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={baseFor(invalid, compact) + (className ? " " + className : "")}
    />
  );
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    invalid?: boolean;
    compact?: boolean;
  },
) {
  const { invalid, compact, className, ...rest } = props;
  return (
    <select
      {...rest}
      className={baseFor(invalid, compact) + (className ? " " + className : "")}
    />
  );
}
