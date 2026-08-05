"use client";

import { CheckCircle2, X } from "lucide-react";

interface ToastProps {
  message: string;
  onClose: () => void;
}

export function Toast({ message, onClose }: ToastProps) {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5 duration-300">
      <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
      <span>{message}</span>
      <button
        onClick={onClose}
        className="ml-2 rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
