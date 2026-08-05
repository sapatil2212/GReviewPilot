export interface KPIItem {
  id: string;
  label: string;
  value: string;
  subValue?: string;
  change: string;
  changeType: "up" | "down" | "neutral";
  period: string;
  sparklineData: number[];
  color: "emerald" | "blue" | "purple" | "orange";
}

export interface ReviewItem {
  id: string;
  authorName: string;
  authorAvatar?: string;
  rating: number;
  timeAgo: string;
  text: string;
  status: "replied" | "pending" | "flagged";
  replyText?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  subtitle: string;
  count?: number;
  completed: boolean;
  type: "review" | "request" | "info" | "status";
}

export interface BusinessListing {
  id: string;
  name: string;
  location: string;
  rating: number;
  reviews: number;
  responseRate: number;
  status: "Active" | "Pending" | "Issues";
  url?: string;
}
