-- Dev seed: placeholder/gag sponsored cards (only inserts if table is empty)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sponsored_placement LIMIT 1) THEN
    -- Get the default tenant ID
    INSERT INTO sponsored_placement (tenant_id, name, headline, image_url, target_url, cta_text, position)
    SELECT t.id, 'RSS Wrangler Pro', 'Upgrade to RSS Wrangler Pro — Unlimited feeds, faster refresh, full-text search', NULL, 'https://rsswrangler.com/pricing', 'Upgrade Now', 3
    FROM tenant t LIMIT 1;

    INSERT INTO sponsored_placement (tenant_id, name, headline, image_url, target_url, cta_text, position)
    SELECT t.id, 'Placeholder Ad', 'Your ad here — This is a placeholder for future sponsors', NULL, 'https://rsswrangler.com/advertise', 'Advertise With Us', 8
    FROM tenant t LIMIT 1;

    INSERT INTO sponsored_placement (tenant_id, name, headline, image_url, target_url, cta_text, position)
    SELECT t.id, 'Coffee Break', 'You have been reading for a while — Take a coffee break!', NULL, 'https://en.wikipedia.org/wiki/Coffee', 'Learn About Coffee', 15
    FROM tenant t LIMIT 1;
  END IF;
END $$;
