"use client";

import { useState } from "react";
import {
  MessageSquare,
  Send,
  Building2,
  CheckCircle2,
  ChevronRight,
  Check,
} from "lucide-react";
import { TaskItem } from "./types";

const INITIAL_TASKS: TaskItem[] = [
  {
    id: "task-1",
    title: "Reply to pending reviews",
    subtitle: "5 reviews pending reply",
    count: 5,
    completed: false,
    type: "review",
  },
  {
    id: "task-2",
    title: "Send review requests",
    subtitle: "12 locations ready for dispatch",
    count: 12,
    completed: false,
    type: "request",
  },
  {
    id: "task-3",
    title: "Update business info",
    subtitle: "3 locations missing hours",
    count: 3,
    completed: false,
    type: "info",
  },
  {
    id: "task-4",
    title: "Check listing status",
    subtitle: "All listings active & verified",
    completed: true,
    type: "status",
  },
];

export function TasksToDo() {
  const [tasks, setTasks] = useState<TaskItem[]>(INITIAL_TASKS);

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h2 className="text-xs font-bold tracking-tight text-slate-900">
            Tasks / To-Do
          </h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.2 text-[10px] font-semibold text-slate-600">
            {tasks.filter((t) => !t.completed).length} Pending
          </span>
        </div>

        <div className="mt-2 space-y-1.5">
          {tasks.map((task) => {
            const Icon =
              task.type === "review"
                ? MessageSquare
                : task.type === "request"
                ? Send
                : task.type === "info"
                ? Building2
                : CheckCircle2;

            return (
              <div
                key={task.id}
                onClick={() => toggleTask(task.id)}
                className={
                  "group flex cursor-pointer items-center justify-between rounded-lg border p-2 transition-all duration-200 " +
                  (task.completed
                    ? "border-slate-100 bg-slate-50/60 opacity-60"
                    : "border-slate-200/70 bg-white hover:border-slate-300")
                }
              >
                <div className="flex items-center gap-2">
                  <div
                    className={
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg " +
                      (task.type === "review"
                        ? "bg-red-50 text-red-500"
                        : task.type === "request"
                        ? "bg-amber-50 text-amber-500"
                        : task.type === "info"
                        ? "bg-blue-50 text-blue-500"
                        : "bg-emerald-50 text-emerald-500")
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>

                  <div>
                    <div
                      className={
                        "text-[11px] font-bold transition " +
                        (task.completed
                          ? "text-slate-400 line-through"
                          : "text-slate-900 group-hover:text-blue-600")
                      }
                    >
                      {task.title}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {task.subtitle}
                    </div>
                  </div>
                </div>

                <div>
                  {task.completed ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  ) : task.count !== undefined ? (
                    <span
                      className={
                        "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold " +
                        (task.type === "review"
                          ? "bg-red-100 text-red-600"
                          : task.type === "request"
                          ? "bg-amber-100 text-amber-600"
                          : "bg-blue-100 text-blue-600")
                      }
                    >
                      {task.count}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-2 text-center">
        <button className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700">
          View All Tasks <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
