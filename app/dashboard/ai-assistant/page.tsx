"use client";

import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";

export default function AiAssistantPlaceholderPage() {
  return (
    <>
      <PageHeader
        title="AI Reply Assistant"
        description="Auto-drafted replies, tone rules, and workflow automation."
      />
      <EmptyState
        icon={Sparkles}
        title="Coming with the AI modules"
        description="Ships with Module 11 (AI Health Score, Action Center, Insights, Competitor, Content Studio, Marketing Calendar, Website Audit, Alerts)."
      />
    </>
  );
}
