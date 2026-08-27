/** Client-safe subscription plan catalog + trial length. */

export const TRIAL_DAYS = 7;

export type ActivatablePlan = "STARTER" | "GROWTH" | "SCALE";

export const SUBSCRIPTION_PLANS: Array<{
  id: ActivatablePlan;
  name: string;
  priceLabel: string;
  blurb: string;
  features: string[];
  popular?: boolean;
}> = [
  {
    id: "STARTER",
    name: "Starter",
    priceLabel: "Free",
    blurb: "Keep one location’s reputation clean forever.",
    features: [
      "1 Google Business location",
      "50 AI replies / month",
      "Basic sentiment analytics",
      "Email support",
    ],
  },
  {
    id: "GROWTH",
    name: "Growth",
    priceLabel: "₹4,999/mo",
    blurb: "AI that runs reviews on autopilot.",
    features: [
      "Up to 5 locations",
      "Unlimited AI replies",
      "Advanced sentiment analysis",
      "Priority chat support",
    ],
    popular: true,
  },
  {
    id: "SCALE",
    name: "Scale",
    priceLabel: "Custom",
    blurb: "For multi-location brands and agencies.",
    features: [
      "Unlimited locations",
      "Custom AI voice",
      "SSO-ready workspace",
      "Dedicated success manager",
    ],
  },
];
