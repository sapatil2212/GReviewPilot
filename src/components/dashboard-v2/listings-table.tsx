"use client";

import { useState } from "react";
import { Star, ExternalLink, Search } from "lucide-react";
import { BusinessListing } from "./types";

const INITIAL_LISTINGS: BusinessListing[] = [
  {
    id: "b-1",
    name: "Acme Dental Care",
    location: "New York, USA",
    rating: 4.7,
    reviews: 1248,
    responseRate: 92,
    status: "Active",
    url: "https://maps.google.com",
  },
  {
    id: "b-2",
    name: "Acme Dental Care",
    location: "Boston, USA",
    rating: 4.8,
    reviews: 842,
    responseRate: 96,
    status: "Active",
    url: "https://maps.google.com",
  },
  {
    id: "b-3",
    name: "Acme Dental Care",
    location: "Chicago, USA",
    rating: 4.6,
    reviews: 620,
    responseRate: 88,
    status: "Active",
    url: "https://maps.google.com",
  },
];

export function ListingsTable() {
  const [search, setSearch] = useState("");
  const [listings] = useState<BusinessListing[]>(INITIAL_LISTINGS);

  const filtered = listings.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
      {/* Table Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-xs font-bold tracking-tight text-slate-900">
            Your Listings
          </h2>
          <p className="text-[10.5px] text-slate-500">
            Google Business Profiles connected to your account
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search listings..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-8 pr-2.5 py-1 text-[11px] text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Table Content */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-slate-100 font-semibold text-slate-400">
              <th className="pb-2 pl-2">Business</th>
              <th className="pb-2">Rating</th>
              <th className="pb-2 text-center">Reviews</th>
              <th className="pb-2 text-center">Response Rate</th>
              <th className="pb-2 text-center">Status</th>
              <th className="pb-2 pr-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((l) => (
              <tr
                key={l.id}
                className="group transition hover:bg-slate-50/80"
              >
                <td className="py-2.5 pl-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 border border-blue-100">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 group-hover:text-blue-600 transition">
                        {l.name}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {l.location}
                      </div>
                    </div>
                  </div>
                </td>

                <td className="py-2.5">
                  <div className="flex items-center gap-1">
                    <span className="font-extrabold text-slate-900">
                      {l.rating}
                    </span>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className="h-2.5 w-2.5 fill-amber-400 text-amber-400"
                        />
                      ))}
                    </div>
                  </div>
                </td>

                <td className="py-2.5 text-center font-bold text-slate-900">
                  {l.reviews.toLocaleString()}
                </td>

                <td className="py-2.5 text-center font-bold text-slate-900">
                  {l.responseRate}%
                </td>

                <td className="py-2.5 text-center">
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.2 text-[9.5px] font-semibold text-emerald-600 border border-emerald-100">
                    {l.status}
                  </span>
                </td>

                <td className="py-2.5 pr-2 text-right">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-600"
                  >
                    View <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
