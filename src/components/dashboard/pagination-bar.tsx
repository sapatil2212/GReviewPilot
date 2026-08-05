"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function PaginationBar({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
}: PaginationBarProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 sm:flex-row">
      <div>
        Showing <span className="font-semibold text-slate-800">{start}</span>–
        <span className="font-semibold text-slate-800">{end}</span> of{" "}
        <span className="font-semibold text-slate-800">{total}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:bg-slate-50"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <div className="px-2 font-semibold text-slate-800">
          Page {page} / {Math.max(1, totalPages)}
        </div>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:bg-slate-50"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
