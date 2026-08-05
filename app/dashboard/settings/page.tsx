"use client";

import { Settings } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";

export default function SettingsPlaceholderPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Notification preferences, timezone, language, and AI defaults."
      />
      <EmptyState
        icon={Settings}
        title="Coming with the Settings module"
        description="Ships with Module 14 (Subscription + Settings)."
      />
    </>
  );
}
