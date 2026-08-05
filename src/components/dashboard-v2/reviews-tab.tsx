"use client";

import { useState } from "react";
import { Star, Search, MessageSquare, CheckCircle2, Sparkles, Send } from "lucide-react";

interface ReviewsTabProps {
  onTriggerToast: (msg: string) => void;
}

const ALL_REVIEWS = [
  { id: "1", name: "Sarah Johnson", rating: 5, time: "2 hours ago", text: "Great service and very professional team. Highly recommend!", status: "replied", reply: "Thank you Sarah! We really appreciate your kind words." },
  { id: "2", name: "Michael Brown", rating: 5, time: "1 day ago", text: "Amazing experience! The staff was friendly and helpful.", status: "replied", reply: "Thanks Michael! Glad to hear our team took great care of you." },
  { id: "3", name: "Emily Davis", rating: 5, time: "2 days ago", text: "Very good service. Will definitely come back again.", status: "pending" },
  { id: "4", name: "David Wilson", rating: 5, time: "3 days ago", text: "Excellent care and attention to detail.", status: "replied" },
  { id: "5", name: "Jessica Lee", rating: 4, time: "4 days ago", text: "Good experience overall. Thank you!", status: "pending" },
  { id: "6", name: "Robert Taylor", rating: 2, time: "5 days ago", text: "Wait time was longer than expected, though treatment was okay.", status: "pending" },
  { id: "7", name: "Amanda White", rating: 5, time: "6 days ago", text: "The team is wonderful. Doctor was very gentle.", status: "replied" },
];

export function ReviewsTab({ onTriggerToast }: ReviewsTabProps) {
  const [search, setSearch] = useState("");
  const [starFilter, setStarFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "replied">("all");
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const filtered = ALL_REVIEWS.filter((r) => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase()) || r.text.toLowerCase().includes(search.toLowerCase());
    const matchesStar = starFilter === "all" || r.rating === starFilter;
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStar && matchesStatus;
  });

  const handleGenerateAIReply = (authorName: string, text: string) => {
    setIsGeneratingAI(true);
    setTimeout(() => {
      setIsGeneratingAI(false);
      setReplyInput(
        `Dear ${authorName.split(" ")[0]},\n\nThank you so much for taking the time to leave us a ${text.includes("Wait") ? "constructive" : "5-star"} review! We take great pride in our service and look forward to welcoming you back again soon.\n\nWarm regards,\nManagement Team`
      );
      onTriggerToast("AI Draft generated with Brand Voice tone!");
    }, 800);
  };

  const handlePostReply = (id: string, name: string) => {
    setActiveReplyId(null);
    setReplyInput("");
    onTriggerToast(`Reply posted to Google for ${name}!`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Review Management Studio</h2>
          <p className="text-xs text-slate-500">
            Manage, filter, and reply to all Google Business Profile reviews in real time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 px-3.5 py-2 text-center border border-blue-100">
            <div className="text-lg font-extrabold text-blue-600">1,248</div>
            <div className="text-[10px] font-semibold text-blue-900 uppercase">Total</div>
          </div>
          <div className="rounded-xl bg-amber-50 px-3.5 py-2 text-center border border-amber-100">
            <div className="text-lg font-extrabold text-amber-600">5</div>
            <div className="text-[10px] font-semibold text-amber-900 uppercase">Pending</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name or keyword..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* Star Rating Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setStarFilter("all")}
            className={
              "rounded-xl px-3 py-1.5 text-xs font-semibold transition " +
              (starFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            All Stars
          </button>
          {[5, 4, 3, 2, 1].map((star) => (
            <button
              key={star}
              onClick={() => setStarFilter(star)}
              className={
                "flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition " +
                (starFilter === star ? "bg-amber-400 text-slate-950 shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
              }
            >
              {star} <Star className="h-3 w-3 fill-current" />
            </button>
          ))}
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
          {(["all", "pending", "replied"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={
                "rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition " +
                (statusFilter === st ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100")
              }
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Review List */}
      <div className="space-y-3">
        {filtered.map((rev) => (
          <div key={rev.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  {rev.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{rev.name}</span>
                    <span className="text-xs text-slate-400">• {rev.time}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={
                          "h-3.5 w-3.5 " +
                          (s <= rev.rating ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200")
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              {rev.status === "replied" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 border border-emerald-100">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Replied
                </span>
              ) : (
                <button
                  onClick={() => {
                    setActiveReplyId(activeReplyId === rev.id ? null : rev.id);
                    setReplyInput("");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Reply Now
                </button>
              )}
            </div>

            <p className="mt-3 text-sm text-slate-700 leading-relaxed">&ldquo;{rev.text}&rdquo;</p>

            {/* AI Reply Drawer */}
            {activeReplyId === rev.id && (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 animate-in fade-in">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    AI Reply Studio
                  </div>
                  <button
                    onClick={() => handleGenerateAIReply(rev.name, rev.text)}
                    disabled={isGeneratingAI}
                    className="flex items-center gap-1.5 rounded-xl bg-white border border-blue-300 px-3 py-1 text-xs font-bold text-blue-600 shadow-sm hover:bg-blue-50"
                  >
                    <Sparkles className={"h-3.5 w-3.5 " + (isGeneratingAI ? "animate-spin" : "")} />
                    {isGeneratingAI ? "Generating..." : "Generate AI Draft"}
                  </button>
                </div>

                <textarea
                  rows={4}
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  placeholder="Type your response or click 'Generate AI Draft'..."
                  className="w-full rounded-xl border border-blue-200 bg-white p-3 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                />

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setActiveReplyId(null)}
                    className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handlePostReply(rev.id, rev.name)}
                    className="flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    <Send className="h-3.5 w-3.5" /> Post to Google
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
