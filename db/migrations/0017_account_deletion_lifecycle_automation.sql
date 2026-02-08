-- Phase 0 slice: account deletion lifecycle automation (grace-window + hard purge).

CREATE INDEX IF NOT EXISTS account_deletion_request_pending_due_idx
  ON account_deletion_request (tenant_id, requested_at ASC)
  WHERE status = 'pending';

ALTER TABLE account_deletion_request
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE account_deletion_request
  DROP CONSTRAINT IF EXISTS account_deletion_request_user_id_fkey;

ALTER TABLE account_deletion_request
  ADD CONSTRAINT account_deletion_request_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES user_account(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_deletion_request_pending_requires_user'
  ) THEN
    ALTER TABLE account_deletion_request
      ADD CONSTRAINT account_deletion_request_pending_requires_user
      CHECK (status <> 'pending' OR user_id IS NOT NULL);
  END IF;
END $$;
