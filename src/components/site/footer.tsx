import Link from "next/link";
import Image from "next/image";
import { Mail, Phone, MapPin } from "lucide-react";

const features = [
  "AI Review Replies",
  "QR Review Campaigns",
  "Reputation Analytics",
  "Local SEO Insights",
  "Competitor Tracking",
  "AI Business Coach",
  "Website & Widgets",
];

// Only real, reachable routes belong here. Google's OAuth verification review
// includes clicking through the public site, and a policy link that goes to "#"
// reads as a missing policy — a rejection reason for sensitive scopes.
//
// "Shipping & Delivery" was dropped rather than recreated: GReviewPilot ships
// nothing physical, and a shipping policy on a SaaS site is the kind of
// copy-pasted boilerplate that makes a reviewer look harder at everything else.
const company = [
  { name: "About Us", href: "/about" },
  { name: "Pricing", href: "/pricing" },
  { name: "Contact", href: "/contact" },
  { name: "Privacy Policy", href: "/privacy" },
  { name: "Terms & Conditions", href: "/terms" },
  { name: "Cookie Policy", href: "/cookies" },
  { name: "Data Deletion", href: "/data-deletion" },
];

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-border bg-surface">
      <div className="bg-mesh pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="inline-block">
              <Image
                src="/assets/logo/greviewpilot-logo.png"
                alt="GReviewPilot Logo"
                width={180}
                height={40}
                className="h-9 w-auto object-contain"
              />
            </Link>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              The AI growth platform for Google reputation. Automate reviews,
              delight customers, and win local search.
            </p>
          </div>

          {/* Features Column */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Features
            </div>
            <ul className="mt-4 space-y-2.5">
              {features.map((f) => (
                <li key={f}>
                  <a
                    href="#features"
                    className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                  >
                    {f}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Column */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Company
            </div>
            <ul className="mt-4 space-y-2.5">
              {company.map((c) => (
                <li key={c.name}>
                  <Link
                    href={c.href}
                    className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Us Column */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Contact Us
            </div>
            <div className="mt-4 space-y-3.5 text-sm text-foreground/80">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Email</div>
                <a
                  href="mailto:contact.greviewpilot@gmail.com"
                  className="mt-0.5 inline-flex items-center gap-1.5 text-sm transition-colors hover:text-foreground"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>contact.greviewpilot@gmail.com</span>
                </a>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground">Phone</div>
                <a
                  href="tel:+919168081355"
                  className="mt-0.5 inline-flex items-center gap-1.5 text-sm transition-colors hover:text-foreground"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>+91 9168 08 1355</span>
                </a>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground">Address</div>
                <div className="mt-0.5 flex items-start gap-1.5 text-sm text-foreground/80">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>Pune, Maharashtra, India</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-6 md:flex-row md:items-center">
          <div className="text-xs text-muted-foreground">
            Copyright © 2026 GReviewPilot All rights reserved. | A product of Brightwave Digital Products LLP.
          </div>
        </div>
      </div>
    </footer>
  );
}
