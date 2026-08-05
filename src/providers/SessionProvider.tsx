"use client";

/**
 * Thin client wrapper around Auth.js's SessionProvider.
 * Kept separate so the root layout stays a Server Component.
 */

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function SessionProvider({ children }: { children: ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
