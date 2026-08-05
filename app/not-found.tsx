import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="relative text-center">
        <div className="pointer-events-none absolute -inset-32 bg-mesh opacity-40" />
        <div className="relative">
          <div className="text-[120px] font-bold tracking-tighter text-gradient leading-none sm:text-[160px]">
            404
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
            Page not found
          </h1>
          <p className="mt-3 max-w-md text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:-translate-y-0.5"
            >
              <Home className="h-4 w-4" /> Go home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
