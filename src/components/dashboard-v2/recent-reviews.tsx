"use client";

import { useState } from "react";
import { Star, ChevronRight, MessageSquare, CheckCircle2 } from "lucide-react";
import { ReviewItem } from "./types";

const INITIAL_REVIEWS: ReviewItem[] = [
  {
    id: "rev-1",
    authorName: "Sarah Johnson",
    rating: 5,
    timeAgo: "2h ago",
    text: "Great service and very professional team. Highly recommend!",
    status: "replied",
  },
  {
    id: "rev-2",
    authorName: "Michael Brown",
    rating: 5,
    timeAgo: "1d ago",
    text: "Amazing experience! The staff was friendly and helpful.",
    status: "replied",
  },
  {
    id: "rev-3",
    authorName: "Emily Davis",
    rating: 5,
    timeAgo: "2d ago",
    text: "Very good service. Will definitely come back again.",
    status: "pending",
  },
  {
    id: "rev-4",
    authorName: "David Wilson",
    rating: 5,
    timeAgo: "3d ago",
    text: "Excellent care and attention to detail.",
    status: "replied",
  },
];

export function RecentReviews() {
  const [reviews, setReviews] = useState<ReviewItem[]>(INITIAL_REVIEWS);
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState("");

  const handleSendReply = (id: string) => {
    if (!replyInput.trim()) return;
    setReviews((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "replied" } : r))
    );
    setActiveReplyId(null);
    setReplyInput("");
  };

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h2 className="text-xs font-bold tracking-tight text-slate-900">
            Recent Reviews
          </h2>
          <button className="text-[11px] font-semibold text-blue-600 hover:text-blue-700">
            View All
          </button>
        </div>

        {/* Reviews List */}
        <div className="mt-2 divide-y divide-slate-100">
          {reviews.map((rev) => (
            <div key={rev.id} className="py-2.5 first:pt-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10.5px] font-bold text-slate-700 border border-slate-200">
                    {rev.authorName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-900">
                        {rev.authorName}
                      </span>
                      <svg className="h-3 w-3" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={
                              "h-2.5 w-2.5 " +
                              (s <= rev.rating
                                ? "fill-amber-400 text-amber-400"
                                : "fill-slate-200 text-slate-200")
                            }
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {rev.timeAgo}
                      </span>
                    </div>
                  </div>
                </div>

                {rev.status === "replied" ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.2 text-[9.5px] font-semibold text-emerald-600 border border-emerald-100">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Replied
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setActiveReplyId(activeReplyId === rev.id ? null : rev.id);
                      setReplyInput(`Hi ${rev.authorName.split(" ")[0]}, thank you for your feedback! `);
                    }}
                    className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-2 py-0.2 text-[9.5px] font-semibold text-blue-600 border border-blue-100 hover:bg-blue-100"
                  >
                    <MessageSquare className="h-2.5 w-2.5" />
                    Pending
                  </button>
                )}
              </div>

              <p className="mt-1 text-[11px] leading-snug text-slate-600">
                &ldquo;{rev.text}&rdquo;
              </p>

              {activeReplyId === rev.id && (
                <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/50 p-2">
                  <textarea
                    rows={2}
                    value={replyInput}
                    onChange={(e) => setReplyInput(e.target.value)}
                    className="w-full rounded-md border border-blue-200 bg-white p-1.5 text-[11px] text-slate-800 outline-none"
                  />
                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setActiveReplyId(null)}
                      className="rounded-md px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-200/60"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSendReply(rev.id)}
                      className="rounded-md bg-blue-600 px-2.5 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-700"
                    >
                      Post Reply
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-2 text-center">
        <button className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700">
          Manage Reviews <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
