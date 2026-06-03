CREATE TABLE IF NOT EXISTS vault_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  raw_description TEXT NOT NULL,
  title TEXT,
  area TEXT,
  priority TEXT DEFAULT 'Medium',
  summary TEXT,
  tags TEXT[],
  image_url TEXT,
  submitted_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE vault_reports DISABLE ROW LEVEL SECURITY;
