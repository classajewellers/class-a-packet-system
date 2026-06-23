-- 065_staff_pins.sql
-- Moves staff PINs out of source code into a hashed DB table.
--
-- NOTE: email is NOT UNIQUE here because two staff members share the
-- customercare@classa.com.au mailbox. name is the login identifier
-- (matches what verify-pin/route.ts looks up) and is the UNIQUE column.

CREATE TABLE IF NOT EXISTS staff_pins (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  pin_hash   TEXT        NOT NULL,
  role       TEXT        NOT NULL DEFAULT 'staff',
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE staff_pins DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff_pins ADD COLUMN IF NOT EXISTS name       TEXT;
ALTER TABLE staff_pins ADD COLUMN IF NOT EXISTS email      TEXT;
ALTER TABLE staff_pins ADD COLUMN IF NOT EXISTS pin_hash   TEXT;
ALTER TABLE staff_pins ADD COLUMN IF NOT EXISTS role       TEXT        NOT NULL DEFAULT 'staff';
ALTER TABLE staff_pins ADD COLUMN IF NOT EXISTS active     BOOLEAN     NOT NULL DEFAULT true;
ALTER TABLE staff_pins ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE staff_pins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS staff_pins_email_idx ON staff_pins (email);

-- name is the login key — must be unique
ALTER TABLE staff_pins DROP CONSTRAINT IF EXISTS staff_pins_name_key;
ALTER TABLE staff_pins ADD CONSTRAINT staff_pins_name_key UNIQUE (name);
