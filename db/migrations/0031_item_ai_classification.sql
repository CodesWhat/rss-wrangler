-- AI pre-classification label stored per item (intent + confidence)
ALTER TABLE item ADD COLUMN IF NOT EXISTS ai_classification JSONB;
