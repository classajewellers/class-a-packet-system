/**
 * Staging practice logins for the workshop names Part C migrates.
 *
 * Creates (or reuses) an auth user + profile and tags them Jeweller.
 * Uses the same direct createUser path as Settings → Team and store signup:
 * email confirmed immediately, no invite email.
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL   staging project URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   WORKSHOP_SEED_PASSWORD                      temporary password (min 8)
 *
 * Refuses to run unless the URL host is the staging project
 * (aexfqkaayrcmdehuzpza), unless WORKSHOP_SEED_ALLOW_ANY_HOST=1.
 * Do not point this at production.
 *
 * Expects staging table workshop_roles (slug, name, sort_order, active)
 * and profile_workshop_roles.workshop_role_id. Does not create or rename
 * those tables. Migration workshop_roles is already applied on staging.
 * Not production. A later rename to workshop_role_tags is on hold.
 *
 *   WORKSHOP_SEED_PASSWORD='VaultTeam-Practice1' \
 *   NEXT_PUBLIC_SUPABASE_URL='https://aexfqkaayrcmdehuzpza.supabase.co' \
 *   SUPABASE_SERVICE_ROLE_KEY='…' \
 *   node scripts/seed-workshop-team.mjs
 *
 * People (Class A, system role staff, tag jeweller only — never cad_designer):
 *   Ben ben@classa.com.au, Viv viv@classa.com.au, Joe joseph@classa.com.au,
 *   David david@classa.com.au, Jack jack@classa.com.au,
 *   Shahzad shahrzad@classa.com.au.
 * Josh and Staff Test are not in this list.
 *
 * Re-running does not change an existing password: createUser runs only
 * when the auth user is missing. Auth users are created here, not with
 * raw SQL (auth.identities.email is generated).
 *
 * Sign in at /login with the email and WORKSHOP_SEED_PASSWORD.
 * A manager can replace it from Settings → Team → Set password.
 *
 * Display names stay the short workshop names so jobs stored against
 * "Ben" / "Viv" / … still match. Emails are the existing Class A map
 * in lib/staffEmails.ts. Shahzad was not a workshop_team_members row on
 * staging; the locked spec still includes that name. The address on file
 * is shahrzad@classa.com.au (Shahrzad Givi).
 */

import { createClient } from "@supabase/supabase-js";

const STAGING_HOST = "aexfqkaayrcmdehuzpza.supabase.co";
const CLASS_A_TENANT = "00000000-0000-0000-0000-000000000001";

const PEOPLE = [
  { name: "Ben", email: "ben@classa.com.au" },
  { name: "Viv", email: "viv@classa.com.au" },
  { name: "Joe", email: "joseph@classa.com.au" },
  { name: "David", email: "david@classa.com.au" },
  { name: "Jack", email: "jack@classa.com.au" },
  { name: "Shahzad", email: "shahrzad@classa.com.au" },
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const password = process.env.WORKSHOP_SEED_PASSWORD || "";

if (!url || !serviceKey) fail("Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
if (password.length < 8) fail("Set WORKSHOP_SEED_PASSWORD to at least 8 characters.");

let host = "";
try {
  host = new URL(url).host;
} catch {
  fail(`Invalid Supabase URL: ${url}`);
}
if (host !== STAGING_HOST && process.env.WORKSHOP_SEED_ALLOW_ANY_HOST !== "1") {
  fail(`Refusing to seed ${host}. This script is for staging (${STAGING_HOST}). Set WORKSHOP_SEED_ALLOW_ANY_HOST=1 to override.`);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findAuthUserId(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`listUsers failed: ${error.message}`);
    const match = (data?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
    if (match) return match.id;
    if (!data?.users?.length || data.users.length < 200) return null;
    page += 1;
  }
}

const { data: jeweller, error: roleError } = await supabase
  .from("workshop_roles")
  .select("id")
  .eq("tenant_id", CLASS_A_TENANT)
  .eq("slug", "jeweller")
  .maybeSingle();

if (roleError) fail(`workshop_roles lookup failed: ${roleError.message}. Table workshop_roles (slug, name, sort_order, active) must already exist. This script does not rename it.`);
if (!jeweller) fail("Jeweller row is missing for Class A on workshop_roles (slug = jeweller).");

for (const person of PEOPLE) {
  let userId = await findAuthUserId(person.email);

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: person.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: person.name,
        role: "staff",
        tenant_id: CLASS_A_TENANT,
      },
    });
    if (error || !data.user) {
      console.error(`FAIL ${person.name} <${person.email}>: ${error?.message ?? "no user returned"}`);
      continue;
    }
    userId = data.user.id;
    console.log(`created ${person.name} <${person.email}>`);
  } else {
    console.log(`exists  ${person.name} <${person.email}>`);
  }

  const { data: profile, error: profileLookupError } = await supabase
    .from("profiles")
    .select("id, tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileLookupError) {
    console.error(`FAIL profile lookup ${person.email}: ${profileLookupError.message}`);
    continue;
  }
  if (profile && profile.tenant_id !== CLASS_A_TENANT) {
    console.error(`SKIP ${person.email}: auth user already belongs to tenant ${profile.tenant_id}`);
    continue;
  }

  const { error: upsertError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      full_name: person.name,
      role: "staff",
      email: person.email,
      auth_user_id: userId,
      tenant_id: CLASS_A_TENANT,
    },
    { onConflict: "id" }
  );
  if (upsertError) {
    console.error(`FAIL profile ${person.email}: ${upsertError.message}`);
    continue;
  }

  const { error: linkError } = await supabase.from("profile_workshop_roles").upsert(
    {
      tenant_id: CLASS_A_TENANT,
      profile_id: userId,
      workshop_role_id: jeweller.id,
    },
    { onConflict: "profile_id,workshop_role_id" }
  );
  if (linkError) {
    console.error(`FAIL tag ${person.email}: ${linkError.message}`);
    continue;
  }
  console.log(`tagged  ${person.name} as Jeweller`);
}

console.log("Done. Sign in at /login with each email and WORKSHOP_SEED_PASSWORD.");
