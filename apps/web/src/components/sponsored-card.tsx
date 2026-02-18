"use client";

import type { SponsoredCard as SponsoredCardType } from "@rss-wrangler/contracts";
import { useCallback, useEffect, useRef } from "react";
import { trackSponsoredClick, trackSponsoredImpression } from "@/lib/api";

interface SponsoredCardProps {
  placement: SponsoredCardType;
}

export function SponsoredCard({ placement }: SponsoredCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const impressionTracked = useRef(false);

  // Track impression when card becomes visible via IntersectionObserver
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !impressionTracked.current) {
          impressionTracked.current = true;
          void trackSponsoredImpression(placement.id);
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [placement.id]);

  const handleClick = useCallback(() => {
    void trackSponsoredClick(placement.id);
  }, [placement.id]);

  return (
    <article ref={cardRef} className="sponsored-card">
      <span className="sponsored-badge">Sponsored</span>

      <div style={{ padding: "0 var(--sp-4)" }}>
        <h3 className="sponsored-headline">
          <a
            href={placement.targetUrl}
            target="_blank"
            rel="noopener sponsored"
            onClick={handleClick}
          >
            {placement.headline}
          </a>
        </h3>

        {placement.imageUrl && (
          <img
            src={placement.imageUrl}
            alt=""
            className="sponsored-image"
            loading="lazy"
            width={600}
            height={315}
          />
        )}

        <a
          href={placement.targetUrl}
          target="_blank"
          rel="noopener sponsored"
          className="sponsored-cta"
          onClick={handleClick}
        >
          {placement.ctaText}
        </a>
      </div>
    </article>
  );
}
