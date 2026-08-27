"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ShieldAlert, KeyRound, Mail, Lock, Key, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("contactgreviewpilot@gmail.com");
  const [password, setPassword] = useState("greviewpilot@2026");
  const [secret, setSecret] = useState("123");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !secret) {
      toast.error("Please fill in all fields including the Super Admin Secret");
      return;
    }

    setLoading(true);

    try {
      // Step 1: Validate Super Admin credentials & Secret Key via Super Admin API
      const res = await fetch("/api/super-admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, secret }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Invalid Super Admin credentials or secret");
      }

      // Step 2: Establish NextAuth Session
      const authRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/super-admin",
      });

      if (authRes?.error) {
        throw new Error(authRes.error);
      }

      toast.success("Super Admin Authenticated Successfully!");
      router.push("/super-admin");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to authenticate Super Admin");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Background Glow Overlay */}
      <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-blue-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md p-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5 shadow-lg shadow-blue-500/20 mb-4 flex items-center justify-center">
              <div className="h-full w-full rounded-[14px] bg-slate-950 flex items-center justify-center">
                <ShieldAlert className="h-7 w-7 text-blue-400" />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Super Admin Portal</h1>
            <p className="mt-1 text-sm text-slate-400">
              GReviewPilot Central Operations & Governance
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Super Admin Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@greviewpilot.com"
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/60 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/60 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Super Admin Secret Passkey</span>
                <span className="text-[10px] text-blue-400 font-medium">SUPER_ADMIN_SECRET</span>
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-400" />
                <input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="123"
                  className="w-full rounded-xl border border-amber-500/30 bg-slate-950/60 pl-10 pr-4 py-2.5 text-sm text-amber-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition font-mono"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Authenticate Super Admin</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <KeyRound className="h-3.5 w-3.5 text-slate-400" />
              Authorized Personnel Only • Strict Security Audit Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
