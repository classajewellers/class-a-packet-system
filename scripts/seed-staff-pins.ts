/**
 * Seed script: hash and upsert all staff PINs into the staff_pins table.
 *
 * Run from the project root:
 *   npx tsx scripts/seed-staff-pins.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set
 * (loaded automatically from .env.local in the project root).
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

// ── Load .env.local ───────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("ERROR: .env.local not found. Run from the project root.");
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnvLocal();

// ── Staff data ────────────────────────────────────────────────────────────────
// Source of truth. After seeding, delete the PIN column from this file and
// remove verify-pin/route.ts's hardcoded STAFF_PINS entirely.
//
// NOTE: Paull Scudds and Zac Mucklow share customercare@classa.com.au.
// email is stored for informational purposes only (not used for login).
// name is the unique login identifier.

const STAFF: Array<{ name: string; email: string; pin: string; role: "manager" | "staff" }> = [
  { name: "Aisha Scott",       email: "aisha@classa.com.au",        pin: "7875", role: "staff"   },
  { name: "Arissa Michos",     email: "arissa@classa.com.au",       pin: "6916", role: "manager" },
  { name: "Benjamin Mucklow",  email: "ben@classa.com.au",          pin: "5320", role: "manager" },
  { name: "Bradley Mucklow",   email: "brad@classa.com.au",         pin: "5378", role: "manager" },
  { name: "Bridget Moore",     email: "bridget@classa.com.au",      pin: "8484", role: "staff"   },
  { name: "Charlotte Beavis",  email: "charlotte@classa.com.au",    pin: "2780", role: "staff"   },
  { name: "Daniel Beecken",    email: "daniel@classa.com.au",       pin: "1171", role: "staff"   },
  { name: "David Johnson",     email: "david@classa.com.au",        pin: "1103", role: "staff"   },
  { name: "Dior Munro",        email: "dior@classa.com.au",         pin: "9863", role: "staff"   },
  { name: "Donna Cordes",      email: "donna@classa.com.au",        pin: "0204", role: "staff"   },
  { name: "Ivy Wood",          email: "ivy@classa.com.au",          pin: "4873", role: "staff"   },
  { name: "Jack Mullan",       email: "jack@classa.com.au",         pin: "4214", role: "staff"   },
  { name: "Jessica D'Alfonso", email: "jess@classa.com.au",         pin: "5333", role: "staff"   },
  { name: "Joseph Onorato",    email: "joseph@classa.com.au",       pin: "1623", role: "staff"   },
  { name: "Joshua Mucklow",    email: "josh@classa.com.au",         pin: "2204", role: "manager" },
  { name: "Keeley Mucklow",    email: "keeley@classa.com.au",       pin: "0034", role: "staff"   },
  { name: "Leah Newton",       email: "leah@classa.com.au",         pin: "0906", role: "staff"   },
  { name: "Melody Abram",      email: "melody@classa.com.au",       pin: "1065", role: "staff"   },
  { name: "Monica Maghsoodi",  email: "monica@classa.com.au",       pin: "6306", role: "staff"   },
  { name: "Paull Scudds",      email: "customercare@classa.com.au", pin: "2367", role: "staff"   },
  { name: "Sam Mucklow",       email: "sam@classa.com.au",          pin: "0994", role: "manager" },
  { name: "Shahrzad Givi",     email: "shahrzad@classa.com.au",     pin: "3434", role: "staff"   },
  { name: "Sinziana Peters",   email: "sinziana@classa.com.au",     pin: "9344", role: "staff"   },
  { name: "Vivian Valladares", email: "viv@classa.com.au",          pin: "0409", role: "staff"   },
  { name: "Zac Mucklow",       email: "customercare@classa.com.au", pin: "9006", role: "staff"   },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const COST_FACTOR = 12;
  console.log(`Hashing ${STAFF.length} PINs with bcrypt cost=${COST_FACTOR}…`);

  let succeeded = 0;
  let failed    = 0;

  for (const member of STAFF) {
    const pin_hash = await bcrypt.hash(member.pin, COST_FACTOR);

    const { error } = await supabase.from("staff_pins").upsert(
      {
        name:       member.name,
        email:      member.email,
        pin_hash,
        role:       member.role,
        active:     true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" }
    );

    if (error) {
      console.error(`  FAIL  ${member.name}: ${error.message}`);
      failed++;
    } else {
      console.log(`  OK    ${member.name}`);
      succeeded++;
    }
  }

  console.log(`\nDone: ${succeeded} seeded, ${failed} failed.`);

  if (failed > 0) {
    console.error("Some rows failed — check errors above and re-run.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
