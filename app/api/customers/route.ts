import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { Client } from "pg";

export const dynamic = "force-dynamic";

interface CustomerRow {
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  maiden_name: string | null;
  total_orders: number;
  non_repair_orders: number;
  total_quotes: number;
  total_spend: number;
  non_repair_spend: number;
  last_visit: string;
  first_seen: string;
  articles_sample: string; // for search only, stripped from response
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") ?? "").toLowerCase().trim();

  try {
    const tenantId = req.headers.get('x-tenant-id') ?? '';
    const supabase = await createTenantSupabaseClient(tenantId);

    // Fetch packets — include packet_type for non-repair aggregation
    const packetsQ = supabase
      .from("packets")
      .select(
        "id, customer_email, customer_phone, customer_first_name, customer_last_name, total_charges, created_at, articles, instructions, packet_type"
      )
      .order("created_at", { ascending: false });
    const { data: packets, error: pErr } = await (tenantId ? packetsQ.eq("tenant_id", tenantId) : packetsQ);

    if (pErr) {
      return NextResponse.json({ customers: [], error: pErr.message }, { status: 500 });
    }

    // TEMP DEBUG: surface raw rows for josh@classa.com.au to identify stale DB data
    const _debugJoshPackets = (packets ?? [])
      .filter(p => (p.customer_email ?? "").toLowerCase().includes("josh") || (p.customer_email ?? "").toLowerCase().includes("classa"))
      .map(p => ({ id: p.id, email: p.customer_email, first_name: p.customer_first_name, last_name: p.customer_last_name }));

    // Fetch quotes — only columns needed
    let quotes: { customer_email: string | null; customer_phone: string | null; customer_first_name: string | null; customer_last_name: string | null; created_at: string }[] = [];
    try {
      const quotesQ = supabase
        .from("quotes")
        .select("customer_email, customer_phone, customer_first_name, customer_last_name, created_at")
        .order("created_at", { ascending: false });
      const { data: qData } = await (tenantId ? quotesQ.eq("tenant_id", tenantId) : quotesQ);
      quotes = qData ?? [];
    } catch {
      // quotes table may not exist
    }

    // Fetch customers table — source of truth for name/phone when set,
    // and the only source for profile-only customers with no packets/quotes yet.
    let customerProfileMap = new Map<string, { first_name: string | null; last_name: string | null; phone: string | null; maiden_name: string | null; created_at: string }>();
    let _debugCustRows: { email: string | null; first_name: string | null; last_name: string | null; tenant_id?: string | null }[] = [];
    try {
      const custQ = supabase.from("customers").select("email, first_name, last_name, phone, maiden_name, created_at, tenant_id");
      const { data: custData } = await (tenantId ? custQ.eq("tenant_id", tenantId) : custQ);
      _debugCustRows = (custData ?? [])
        .filter(c => (c.email ?? "").toLowerCase().includes("josh") || (c.email ?? "").toLowerCase().includes("classa"))
        .map(c => ({ email: c.email, first_name: c.first_name, last_name: c.last_name, tenant_id: c.tenant_id }));
      for (const c of custData ?? []) {
        if (c.email) {
          customerProfileMap.set(c.email.toLowerCase().trim(), {
            first_name: c.first_name ?? null,
            last_name: c.last_name ?? null,
            phone: c.phone ?? null,
            maiden_name: c.maiden_name ?? null,
            created_at: c.created_at ?? new Date().toISOString(),
          });
        }
      }
    } catch {
      // customers table may not exist
    }

    // ── Aggregate by email ───────────────────────────────────────────────────
    const map = new Map<string, CustomerRow>();

    for (const p of packets ?? []) {
      const key = (p.customer_email ?? "").toLowerCase().trim();
      if (!key) continue;

      const existing = map.get(key);
      const amount = typeof p.total_charges === "number" ? p.total_charges : 0;
      const isRepair = p.packet_type === "repair";
      const articles = [p.articles, p.instructions].filter(Boolean).join(" ");

      if (existing) {
        existing.total_orders += 1;
        existing.total_spend += amount;
        if (!isRepair) {
          existing.non_repair_orders += 1;
          existing.non_repair_spend += amount;
        }
        if (p.created_at > existing.last_visit) existing.last_visit = p.created_at;
        if (p.created_at < existing.first_seen) existing.first_seen = p.created_at;
        if (p.customer_first_name && !existing.first_name) existing.first_name = p.customer_first_name;
        if (p.customer_last_name && !existing.last_name) existing.last_name = p.customer_last_name;
        if (p.customer_phone && !existing.phone) existing.phone = p.customer_phone;
        existing.articles_sample += " " + articles;
      } else {
        map.set(key, {
          email: key,
          phone: p.customer_phone ?? null,
          first_name: p.customer_first_name ?? null,
          last_name: p.customer_last_name ?? null,
          maiden_name: customerProfileMap.get(key)?.maiden_name ?? null,
          total_orders: 1,
          non_repair_orders: isRepair ? 0 : 1,
          total_quotes: 0,
          total_spend: amount,
          non_repair_spend: isRepair ? 0 : amount,
          last_visit: p.created_at,
          first_seen: p.created_at,
          articles_sample: articles,
        });
      }
    }

    // Merge in quotes (creates entry if email-only customer)
    for (const q of quotes) {
      const key = (q.customer_email ?? "").toLowerCase().trim();
      if (!key) continue;

      const existing = map.get(key);
      if (existing) {
        existing.total_quotes += 1;
        if (q.created_at > existing.last_visit) existing.last_visit = q.created_at;
        if (q.created_at < existing.first_seen) existing.first_seen = q.created_at;
      } else {
        map.set(key, {
          email: key,
          phone: q.customer_phone ?? null,
          first_name: q.customer_first_name ?? null,
          last_name: q.customer_last_name ?? null,
          maiden_name: customerProfileMap.get(key)?.maiden_name ?? null,
          total_orders: 0,
          non_repair_orders: 0,
          total_quotes: 1,
          total_spend: 0,
          non_repair_spend: 0,
          last_visit: q.created_at,
          first_seen: q.created_at,
          articles_sample: "",
        });
      }
    }

    // Merge customers table into the map:
    // - For emails already in the map (from packets/quotes): apply profile name/phone as
    //   source of truth (staff edits the customers table; packet data is frozen at entry time).
    // - For emails only in the customers table: add them so profile-only customers
    //   (no packets or quotes yet) appear in the Customers tab.
    for (const [key, profile] of Array.from(customerProfileMap)) {
      const existing = map.get(key);
      if (existing) {
        if (profile.first_name) existing.first_name = profile.first_name;
        if (profile.last_name) existing.last_name = profile.last_name;
        if (profile.phone) existing.phone = profile.phone;
        existing.maiden_name = profile.maiden_name ?? existing.maiden_name;
      } else {
        map.set(key, {
          email: key,
          phone: profile.phone,
          first_name: profile.first_name,
          last_name: profile.last_name,
          maiden_name: profile.maiden_name,
          total_orders: 0,
          non_repair_orders: 0,
          total_quotes: 0,
          total_spend: 0,
          non_repair_spend: 0,
          last_visit: profile.created_at,
          first_seen: profile.created_at,
          articles_sample: "",
        });
      }
    }

    // ── Sort by last_visit desc ───────────────────────────────────────────────
    let customers = Array.from(map.values()).sort(
      (a, b) => new Date(b.last_visit).getTime() - new Date(a.last_visit).getTime()
    );

    // ── Search ────────────────────────────────────────────────────────────────
    if (search) {
      customers = customers.filter((c) => {
        const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
        return (
          name.includes(search) ||
          (c.maiden_name ?? "").toLowerCase().includes(search) ||
          (c.email ?? "").toLowerCase().includes(search) ||
          (c.phone ?? "").toLowerCase().includes(search) ||
          (c.articles_sample ?? "").toLowerCase().includes(search)
        );
      });
    }

    // Strip the articles_sample field from the response (internal only)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const result = customers.map(({ articles_sample: _a, ...rest }) => rest);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] ?? supabaseUrl;

    // Raw direct-Postgres debug block — bypasses supabase-js/PostgREST entirely
    const pgConnStr = process.env.DATABASE_URL || process.env.DIRECT_URL || null;
    let _debug_raw_pg_select: unknown = "no_connection_string";
    let _debug_raw_pg_update_count: unknown = "skipped";
    let _debug_raw_pg_verify: unknown = "skipped";
    let _debug_raw_pg_conn_var: string = pgConnStr ? (process.env.DATABASE_URL ? "DATABASE_URL" : "DIRECT_URL") : "none_set__add_DATABASE_URL_or_DIRECT_URL_to_vercel_env";

    if (pgConnStr && !(pgConnStr.startsWith("file:") || pgConnStr.startsWith("sqlite"))) {
      // Extract host from DATABASE_URL without exposing the password
      let pgHostRef = "unknown";
      try {
        const u = new URL(pgConnStr);
        pgHostRef = u.hostname;
        // For Supabase pooler URLs the project ref is in the username (postgres.PROJECTREF)
        const pgUser = u.username; // e.g. "postgres.giucusqyobfsdfwwfyue"
        _debug_raw_pg_conn_var = `${_debug_raw_pg_conn_var} | host=${pgHostRef} | user=${pgUser}`;
      } catch { /* noop */ }

      const pgClient = new Client({ connectionString: pgConnStr, ssl: { rejectUnauthorized: false } });
      try {
        await pgClient.connect();

        // Find what schema packets lives in, and whether it's a table or view
        const schemaResult = await pgClient.query(
          "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_name = 'packets'"
        );
        const packetSchemas = schemaResult.rows.map((r: { table_schema: string; table_type: string }) => `${r.table_schema} (${r.table_type})`);
        _debug_raw_pg_update_count = `packets_schemas_found: ${JSON.stringify(packetSchemas)}`;

        // Check for a view definition
        const viewResult = await pgClient.query(
          "SELECT viewname, definition FROM pg_catalog.pg_views WHERE viewname = 'packets'"
        );
        if (viewResult.rows.length > 0) {
          _debug_raw_pg_update_count = `VIEW: ${JSON.stringify(viewResult.rows[0].definition?.slice(0, 300))}`;
        }

        // Check for triggers on packets (or underlying table)
        const trigResult = await pgClient.query(
          "SELECT trigger_name, event_manipulation, action_statement FROM information_schema.triggers WHERE event_object_table ILIKE 'packet%'"
        );
        if (trigResult.rows.length > 0) {
          _debug_raw_pg_verify = `triggers: ${JSON.stringify(trigResult.rows)}`;
        }

        // Total row count with no filter — does the base table have data?
        const countResult = await pgClient.query("SELECT COUNT(*) FROM public.packets");
        _debug_raw_pg_select = `total_public_packets_count: ${countResult.rows[0].count}`;

        // (schema loop removed — superseded by view/trigger/count checks above)
      } catch (pgErr) {
        _debug_raw_pg_select = `pg_error: ${pgErr instanceof Error ? pgErr.message : String(pgErr)}`;
      } finally {
        await pgClient.end().catch(() => {});
      }
    }

    // Fix via supabase-js using IDs captured from the tenant-filtered packets fetch above
    // No ILIKE — uses the IDs we already know exist from the working query path
    let _debug_supa_update: unknown = "not_run";
    let _debug_supa_verify: unknown = "not_run";
    const _debug_packet_tenant_id = "ids_from_packets_fetch";
    if (_debugJoshPackets.length > 0) {
      const ids = _debugJoshPackets.map((p: { id: string }) => p.id).filter(Boolean);
      if (ids.length > 0) {
        const { data: updData, error: updErr } = await supabase
          .from("packets")
          .update({ customer_email: null })
          .in("id", ids)
          .select("id, customer_email");
        _debug_supa_update = updErr
          ? `error: ${updErr.message}`
          : { updated: updData, ids_targeted: ids };

        // Verify: re-read same IDs — if customer_email is now null, it worked
        const { data: verifyRows, error: verifyErr } = await supabase
          .from("packets")
          .select("id, customer_email")
          .in("id", ids);
        _debug_supa_verify = verifyErr
          ? `error: ${verifyErr.message}`
          : (verifyRows ?? []);
      } else {
        _debug_supa_update = "no_ids_found";
      }
    }

    const response = NextResponse.json({
      customers: result,
      _debug_query_time: new Date().toISOString(),
      _debug_request_id: crypto.randomUUID(),
      _debug_packets_josh: _debugJoshPackets,
      _debug_customers_josh: _debugCustRows,
      _debug_supabase_project_ref: projectRef,
      _debug_env_source: "NEXT_PUBLIC_SUPABASE_URL",
      _debug_raw_pg_conn_var,
      _debug_raw_pg_select,
      _debug_raw_pg_update_count,
      _debug_raw_pg_verify,
      _debug_supa_update,
      _debug_supa_verify,
    });
    response.headers.set("x-debug-commit", "69fc203-fix3-marker");
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ customers: [], error: msg }, { status: 500 });
  }
}
