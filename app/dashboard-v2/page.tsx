"use client";

import { useState } from "react";
import { Sidebar } from "@/components/dashboard-v2/sidebar";
import { Header } from "@/components/dashboard-v2/header";
import { KPICards } from "@/components/dashboard-v2/kpi-cards";
import { ReviewGrowthChart } from "@/components/dashboard-v2/review-growth-chart";
import { RecentReviews } from "@/components/dashboard-v2/recent-reviews";
import { ReviewDistribution } from "@/components/dashboard-v2/review-distribution";
import { RatingTrendChart } from "@/components/dashboard-v2/rating-trend-chart";
import { TasksToDo } from "@/components/dashboard-v2/tasks-todo";
import { ListingsTable } from "@/components/dashboard-v2/listings-table";
import { ReviewsTab } from "@/components/dashboard-v2/reviews-tab";
import { AnalyticsTab } from "@/components/dashboard-v2/analytics-tab";
import { RequestsTab } from "@/components/dashboard-v2/requests-tab";
import { Toast } from "@/components/dashboard-v2/toast";

export default function DashboardV2Page() {
  const [activeTab, setActiveTab] = useState("overview");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState("May 20 – Jun 19, 2025");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] font-sans antialiased text-slate-900">
      {/* Interactive Dark Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Workspace */}
      <div className="flex flex-1 flex-col h-screen overflow-hidden min-w-0">
        {/* Top Header */}
        <Header
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          selectedRange={selectedRange}
          onRangeChange={setSelectedRange}
          onTriggerToast={triggerToast}
        />

        {/* Dynamic Tab Body */}
        <main className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5 max-w-[1600px] mx-auto w-full">
          {activeTab === "overview" && (
            <>
              {/* Top Row: 4 KPI Summary Cards */}
              <KPICards />

              {/* Middle Row: Review Growth Chart + Recent Reviews */}
              <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
                <ReviewGrowthChart />
                <RecentReviews />
              </div>

              {/* Bottom Grid: Distribution, Trend & Tasks */}
              <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-3">
                <ReviewDistribution />
                <RatingTrendChart />
                <TasksToDo />
              </div>

              {/* Business Listings Table */}
              <ListingsTable />
            </>
          )}

          {activeTab === "reviews" && (
            <ReviewsTab onTriggerToast={triggerToast} />
          )}

          {activeTab === "analytics" && <AnalyticsTab />}

          {activeTab === "requests" && (
            <RequestsTab onTriggerToast={triggerToast} />
          )}

          {activeTab === "listings" && <ListingsTable />}

          {["messages", "ai-assistant", "reports", "settings", "integrations"].includes(activeTab) && (
            <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 capitalize">
                {activeTab.replace("-", " ")} Studio
              </h3>
              <p className="mt-2 text-xs text-slate-500 max-w-md mx-auto">
                Configure tone rules, auto-responder workflows, API webhooks, and custom reporting for your Google Business Profiles.
              </p>
              <button
                onClick={() => setActiveTab("overview")}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700"
              >
                Back to Executive Overview
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Global Action Toast */}
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </div>
  );
}
