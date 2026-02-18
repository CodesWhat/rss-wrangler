-- Per-feed circuit breaker columns for resilient polling
ALTER TABLE feed ADD COLUMN IF NOT EXISTS consecutive_failures INT NOT NULL DEFAULT 0;
ALTER TABLE feed ADD COLUMN IF NOT EXISTS circuit_open_until TIMESTAMPTZ;
ALTER TABLE feed ADD COLUMN IF NOT EXISTS last_failure_reason TEXT;
