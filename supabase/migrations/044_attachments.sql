-- File attachments for packets and quotes
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  entity_type TEXT NOT NULL, -- 'packet' or 'quote'
  entity_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,  -- storage path
  file_type TEXT NOT NULL, -- 'image', 'pdf', 'document'
  file_size INTEGER,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE attachments DISABLE ROW LEVEL SECURITY;

-- Valuation photo stored directly on the packet
ALTER TABLE packets ADD COLUMN IF NOT EXISTS valuation_photo_url TEXT;
