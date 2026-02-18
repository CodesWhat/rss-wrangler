-- AI relevance scoring columns: focus score, label, and suggested tags
ALTER TABLE item ADD COLUMN IF NOT EXISTS ai_focus_score REAL;
ALTER TABLE item ADD COLUMN IF NOT EXISTS ai_relevant_label TEXT;
ALTER TABLE item ADD COLUMN IF NOT EXISTS ai_suggested_tags TEXT[];
