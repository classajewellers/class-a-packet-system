// tenantScoped(supabase, tenantId) — the ONLY sanctioned way to query a
// tenant-scoped table from a server-side API route.
//
// WHY THIS EXISTS (2026-09-22 tenant-isolation audit):
// Every table in this codebase is queried through a SERVICE-ROLE client
// (lib/supabase-server.ts), which bypasses Row Level Security
// unconditionally — RLS is either disabled outright or enabled with no
// policies (deny-all for non-service-role, meaningless for service-role).
// That means tenant isolation exists ONLY where a route remembers to add
// `.eq('tenant_id', tenantId)` itself. A live audit found ~25 routes across
// suppliers, purchase orders, locations, movements, RFID, reservations,
// quotes, notifications, and pricing-hub that forgot to — some leaking
// full cross-tenant reads (customer PII, pricing), others allowing
// cross-tenant UPDATE/DELETE. See VAULT_BUILD_CHECKLIST.md for the full
// list and remediation batches.
//
// A per-route "remember to add .eq()" convention has now failed
// repeatedly. This wrapper makes the correct behaviour the ONLY behaviour:
// every select/update/delete/upsert is tenant-filtered before a route gets
// a chance to add its own `.eq('id', ...)` on top, and every insert has
// tenant_id force-set from the verified tenantId — never from the
// request body, never left to the caller to remember.
//
// USAGE — replace `supabase.from(table)` with `tenantScoped(supabase, tenantId).from(table)`
// everywhere in app/api/**. Everything else about a query stays the same:
// chain `.eq('id', params.id)`, `.single()`, `.order(...)`, nested-select
// joins, etc. exactly as before — this only changes how the FROM is
// obtained, not how the rest of the query is built.
//
//   const { data, error } = await tenantScoped(supabase, tenantId)
//     .from('inventory_purchase_orders')
//     .select('*')
//     .eq('id', params.id)
//     .single();
//
// A route that still calls `supabase.from(...)` directly bypasses this
// entirely — that raw form is being treated as the thing to grep for /
// lint against going forward (see the enforcement note at the bottom of
// this file) as routes are migrated batch by batch.
//
// DELIBERATELY OUT OF SCOPE:
// - RPC calls (supabase.rpc(...)) — those already take explicit p_tenant_id
//   params where tenant-scoped, a different call shape entirely.
// - Joined/nested tables in a `.select('*, customer:customers(...)')` —
//   this only scopes the OUTER table's rows. A joined child table is only
//   as safe as the FK it's joined through staying within the same tenant,
//   which this helper does not itself enforce or verify. Flagged as a
//   known limitation, not solved here.
// - Tables with no tenant_id column at all (a handful of global pricing/
//   reference tables, confirmed during the audit) — those must keep using
//   the raw `supabase.from(table)` client directly; wrapping them would
//   inject a tenant_id filter/column that doesn't exist and error at
//   query time. Do not "fix" those into using this helper.

import { SupabaseClient } from "@supabase/supabase-js";

/** A single row (or partial row) being inserted/upserted. */
type Row = Record<string, unknown>;

function withTenantId<T extends Row>(row: T, tenantId: string): T & { tenant_id: string } {
  // Spread THEN overwrite tenant_id last — a caller-supplied tenant_id in
  // the row (e.g. copied from a request body) must never win over the
  // verified one this helper was constructed with.
  return { ...row, tenant_id: tenantId };
}

export function tenantScoped(supabase: SupabaseClient, tenantId: string) {
  if (!tenantId) {
    // Fail loud, not quiet. The historical bug shape was routes doing
    // `req.headers.get('x-tenant-id') ?? ''` and never checking it before
    // querying — an empty tenantId should stop the request, not silently
    // produce a query that (depending on the missing-filter bug this
    // helper exists to prevent) could return everyone's rows.
    throw new Error("tenantScoped() requires a non-empty tenantId — check the caller validated it before querying.");
  }

  return {
    from(table: string) {
      const base = supabase.from(table);

      // select/update/delete are intentionally untyped (any) rather than
      // trying to preserve Supabase's own literal-string column-inference
      // overloads through a wrapper: attempting that (via
      // `Parameters<typeof base.select>` or `typeof base.select` generics)
      // crashes the TypeScript compiler outright on PostgrestFilterBuilder's
      // self-referential generic types. This matches the existing
      // convention already used throughout these routes' own Supabase
      // calls (liberal `as any`/`as Packet[]` casts on query results) —
      // callers cast the returned `data` to whatever shape they expect,
      // exactly as they already did calling `supabase.from(table)` before.
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const select = (columns?: any, options?: any): any =>
        base.select(columns, options).eq("tenant_id", tenantId);
      const update = (values: any): any =>
        base.update(values).eq("tenant_id", tenantId);
      const del = (): any => base.delete().eq("tenant_id", tenantId);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      return {
        select,
        update,
        delete: del,
        insert(rows: Row | Row[]) {
          const withTenant = Array.isArray(rows)
            ? rows.map((r) => withTenantId(r, tenantId))
            : withTenantId(rows, tenantId);
          return base.insert(withTenant as never);
        },
        upsert(rows: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
          const withTenant = Array.isArray(rows)
            ? rows.map((r) => withTenantId(r, tenantId))
            : withTenantId(rows, tenantId);
          return base.upsert(withTenant as never, options);
        },
      };
    },
  };
}
