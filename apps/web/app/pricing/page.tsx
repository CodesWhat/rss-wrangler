"use client";

import { useState } from "react";
import type { BillingInterval } from "@rss-wrangler/contracts";
import Link from "next/link";

const hostedPlans = [
  {
    name: "Free",
    monthlyPrice: "$0",
    annualPrice: "$0",
    monthlyCadence: "forever",
    annualCadence: "forever",
    features: ["Up to 50 feeds", "500 items/day ingestion", "Title/source search", "60-minute polling"]
  },
  {
    name: "Pro",
    monthlyPrice: "$7",
    annualPrice: "$70",
    monthlyCadence: "per month",
    annualCadence: "per year",
    features: ["Unlimited feeds", "Full-text search", "10-minute polling", "Reader mode (hosted Pro gate)"]
  },
  {
    name: "Pro + AI",
    monthlyPrice: "$14",
    annualPrice: "$140",
    monthlyCadence: "per month",
    annualCadence: "per year",
    features: ["Everything in Pro", "AI summaries and digests", "AI-assisted ranking signals", "Advanced explainability tools"]
  }
] as const;

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Pricing</h1>
        <p className="page-meta">Hosted plans for convenience. Self-host stays fully unlocked.</p>
      </div>

      <section className="section-card">
        <div className="layout-toggle billing-interval-toggle" role="tablist" aria-label="Pricing interval">
          <button
            type="button"
            className={`layout-toggle-btn button-small ${interval === "monthly" ? "button-active" : ""}`}
            onClick={() => setInterval("monthly")}
            role="tab"
            aria-selected={interval === "monthly"}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`layout-toggle-btn button-small ${interval === "annual" ? "button-active" : ""}`}
            onClick={() => setInterval("annual")}
            role="tab"
            aria-selected={interval === "annual"}
          >
            Annual (2 mo free)
          </button>
        </div>

        <div className="billing-plans">
          {hostedPlans.map((plan) => (
            <article key={plan.name} className="billing-plan-card">
              <div className="billing-plan-title">{plan.name}</div>
              <div className="billing-plan-price">{interval === "annual" ? plan.annualPrice : plan.monthlyPrice}</div>
              <p className="muted">{interval === "annual" ? plan.annualCadence : plan.monthlyCadence}</p>
              <ul className="muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginTop: "var(--sp-4)" }}>
          <Link href="/signup" className="button button-primary">
            Start free
          </Link>
          <Link href="/login" className="button">
            Log in
          </Link>
          <Link href="/settings" className="button">
            Manage billing
          </Link>
        </div>
      </section>
    </>
  );
}
