-- Alter personal_access_tokens table to support longer JWT tokens
-- JWT tokens are typically 200+ characters, so we need TEXT instead of VARCHAR(64)

-- Drop the unique constraint on token first (if it exists)
ALTER TABLE personal_access_tokens DROP CONSTRAINT IF EXISTS personal_access_tokens_token_key;

-- Alter the token column to TEXT
ALTER TABLE personal_access_tokens ALTER COLUMN token TYPE TEXT;

-- Recreate the unique constraint (PostgreSQL allows unique constraints on TEXT columns)
ALTER TABLE personal_access_tokens ADD CONSTRAINT personal_access_tokens_token_key UNIQUE (token);

