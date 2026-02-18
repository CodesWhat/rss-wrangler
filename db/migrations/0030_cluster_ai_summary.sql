-- AI-generated narrative summary cached on cluster
ALTER TABLE cluster ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE cluster ADD COLUMN IF NOT EXISTS ai_summary_generated_at TIMESTAMPTZ;
