/**
 * Canonical dashboard navigation.
 *
 * Every route under /dashboard is registered here. The sidebar reads
 * this list; pages import specific items when they need to check the
 * active section for breadcrumbs, etc.
 */

import {
  BarChart3,
  Building2,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  MessageSquareWarning,
  Plug,
  QrCode,
  Send,
  Settings,
  Sparkles,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  /** Additional path prefixes that should mark this item active. */
  match?: string[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/reviews", label: "Reviews", icon: Star },
      { href: "/dashboard/reviews/feedback", label: "Private Feedback", icon: MessageSquareWarning },
      { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/dashboard/requests", label: "Requests", icon: Send, badge: "New" },
    ],
  },
  {
    label: "AI Tools",
    items: [
      { href: "/dashboard/reviews/funnel", label: "AI Review Funnel", icon: Sparkles },
      { href: "/dashboard/insights", label: "AI Review Insights", icon: Lightbulb },
      { href: "/dashboard/posts", label: "Google Posts", icon: Megaphone },
      {
        href: "/dashboard/website",
        label: "AI Website Builder",
        icon: Globe,
        badge: "New",
        // The editor itself lives at /builder, outside /dashboard, so it is
        // registered here to keep this item highlighted while editing.
        match: ["/dashboard/website", "/builder"],
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        href: "/dashboard/business",
        label: "Business Profile",
        icon: Building2,
      },
      {
        href: "/dashboard/locations",
        label: "Locations",
        icon: FolderOpen,
        match: ["/dashboard/locations"],
      },
      {
        href: "/dashboard/team",
        label: "Team",
        icon: Users,
        match: ["/dashboard/team"],
      },
      {
        href: "/dashboard/qr",
        label: "QR Codes",
        icon: QrCode,
      },
      {
        href: "/dashboard/media",
        label: "Media Library",
        icon: ImageIcon,
      },
      {
        href: "/dashboard/integrations/google",
        label: "Google Business",
        icon: Plug,
        match: ["/dashboard/integrations"],
      },
    ],
  },
  {
    label: "Coming soon",
    items: [
      {
        href: "/dashboard/ai-assistant",
        label: "AI Reply Assistant",
        icon: Sparkles,
      },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Flat list of every registered nav item, used to resolve the most
 * specific match when routes are nested (e.g. "/dashboard/reviews" vs
 * "/dashboard/reviews/funnel" are separate sidebar entries — only the
 * longer, more specific one should light up). */
const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;

  const prefixesToCheck = [item.href, ...(item.match ?? [])];
  const matchesAnyPrefix = prefixesToCheck.some(
    (p) => p !== "/dashboard" && pathname.startsWith(p + "/"),
  );
  if (!matchesAnyPrefix) return false;

  // Another registered item may be a more specific (longer) prefix match
  // for this pathname — e.g. "/dashboard/reviews/funnel" is its own item,
  // so "/dashboard/reviews" must not also claim active state.
  const moreSpecificItemExists = ALL_NAV_ITEMS.some((other) => {
    if (other === item) return false;
    const otherPrefixes = [other.href, ...(other.match ?? [])];
    return otherPrefixes.some(
      (p) =>
        p.length > item.href.length &&
        p !== "/dashboard" &&
        (pathname === p || pathname.startsWith(p + "/")),
    );
  });

  return !moreSpecificItemExists;
}
