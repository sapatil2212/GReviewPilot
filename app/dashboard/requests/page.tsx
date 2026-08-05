"use client";

/**
 * /dashboard/requests — placeholder using the existing static tab.
 * Real data lands with the Review Requests / Campaigns modules.
 */

import { toast } from "sonner";
import { RequestsTab } from "@/components/dashboard-v2/requests-tab";

export default function RequestsPage() {
  return <RequestsTab onTriggerToast={(m) => toast(m)} />;
}
