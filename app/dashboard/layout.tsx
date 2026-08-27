"use client";

/**
 * Shared layout for every /dashboard/** route.
 *
 * Renders the sidebar + header shell once so each page only needs to
 * emit its own <main> content. Mobile menu state lives here.
 *
 * Also gates incomplete Google signups, expired trials, and the
 * first-run welcome modal.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { AppHeader } from "@/components/dashboard/app-header";
import { WelcomeTrialModal } from "@/components/dashboard/welcome-trial-modal";
import { SubscribePlanModal } from "@/components/auth/subscribe-plan-modal";
import { apiFetch } from "@/lib/fetcher";

type MeDto = {
  signupIncomplete: boolean;
  welcomePending: boolean;
  user: { firstName: string; email: string };
  tenant: { name: string; plan: string } | null;
  trial: {
    daysRemaining: number | null;
    endsAt: string | null;
    expired: boolean;
    needsSubscription: boolean;
  };
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<MeDto | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [subscribeBlocking, setSubscribeBlocking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiFetch<MeDto>("/api/auth/me");
        if (cancelled) return;
        if (data.signupIncomplete) {
          router.replace("/auth?mode=signup&google=1");
          return;
        }
        setMe(data);
        if (data.trial.needsSubscription) {
          setSubscribeBlocking(true);
          setSubscribeOpen(true);
        } else if (data.welcomePending) {
          setWelcomeOpen(true);
        }
      } catch {
        // requireSession failures are handled by middleware / API.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] font-sans antialiased text-slate-900">
      <AppSidebar
        isOpenMobile={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex flex-1 flex-col h-screen overflow-hidden min-w-0">
        <AppHeader onOpenMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-[1600px] mx-auto w-full">
          {children}
        </main>
      </div>

      {me && (
        <WelcomeTrialModal
          open={welcomeOpen}
          firstName={me.user.firstName}
          businessName={me.tenant?.name ?? ""}
          daysRemaining={me.trial.daysRemaining}
          trialEndsAt={me.trial.endsAt}
          onClose={() => setWelcomeOpen(false)}
          onSubscribe={() => {
            setWelcomeOpen(false);
            setSubscribeBlocking(false);
            setSubscribeOpen(true);
          }}
        />
      )}

      <SubscribePlanModal
        open={subscribeOpen}
        payload={{
          firstName: me?.user.firstName,
          businessName: me?.tenant?.name,
          email: me?.user.email,
          trialEndsAt: me?.trial.endsAt,
          plan: me?.tenant?.plan,
        }}
        blocking={subscribeBlocking}
        onClose={
          subscribeBlocking
            ? undefined
            : () => setSubscribeOpen(false)
        }
        onActivated={() => {
          setSubscribeOpen(false);
          setSubscribeBlocking(false);
          toast.success("Plan activated");
          router.refresh();
          window.location.reload();
        }}
      />
    </div>
  );
}
