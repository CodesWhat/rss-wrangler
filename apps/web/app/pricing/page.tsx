import Link from "next/link";

const hostedPlans = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    features: ["Up to 50 feeds", "500 items/day ingestion", "Title/source search", "60-minute polling"]
  },
  {
    name: "Pro",
    price: "$7",
    cadence: "per month",
    features: ["Unlimited feeds", "Full-text search", "10-minute polling", "Reader mode (hosted Pro gate)"]
  },
  {
    name: "Pro + AI",
    price: "$14",
    cadence: "per month",
    features: ["Everything in Pro", "AI summaries and digests", "AI-assisted ranking signals", "Advanced explainability tools"]
  }
] as const;

export default function PricingPage() {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Pricing</h1>
        <p className="page-meta">Hosted plans for convenience. Self-host stays fully unlocked.</p>
      </div>

      <section className="section-card">
        <div className="billing-plans">
          {hostedPlans.map((plan) => (
            <article key={plan.name} className="billing-plan-card">
              <div className="billing-plan-title">{plan.name}</div>
              <div className="billing-plan-price">{plan.price}</div>
              <p className="muted">{plan.cadence}</p>
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
