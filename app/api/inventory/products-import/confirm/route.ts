import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// This route CREATES new inventory_products (Design shells) only. It never
// updates or touches an existing product. Only these six classification columns
// are ever written — cost, marketing/website/SEO/care, stock, and variant data
// are deliberately excluded and must never be set here.

interface ConfirmRow {
  name:         string;
  collection:   string | null;
  category_raw: string | null;
  category_id:  string | null;
  design:       string | null;
  style:        string | null;
  setting_type: string | null;
  force_create: boolean;   // true = create even though flagged a possible duplicate
}

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  try {
    const body = await req.json();
    const rows = (body?.rows ?? []) as ConfirmRow[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows array is required and must not be empty" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Server-side duplicate re-guard: never silently create a second product
    // with a name that already exists, unless the row is explicitly forced.
    const { data: existing, error: exErr } = await supabase
      .from("inventory_products")
      .select("name")
      .eq("tenant_id", tenantId);
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

    const existingNorm = new Set((existing ?? []).map(p => norm(p.name)));

    const created: string[] = [];
    const skipped: { name: string; reason: string }[] = [];
    // Guard against duplicate names appearing twice in the same payload.
    const createdNorm = new Set<string>();

    for (const row of rows) {
      const name = String(row?.name ?? "").trim();
      if (!name) { skipped.push({ name: "(blank)", reason: "Missing name" }); continue; }

      const nn = norm(name);

      if (!row.force_create && existingNorm.has(nn)) {
        skipped.push({ name, reason: "A product with this name already exists — not created" });
        continue;
      }
      if (createdNorm.has(nn)) {
        skipped.push({ name, reason: "Duplicate of another row in this import — created once only" });
        continue;
      }

      // Explicit column allowlist — only these fields are ever written.
      const insertRow = {
        tenant_id:    tenantId,
        name,
        collection:   row.collection   || null,
        category:     row.category_raw || null,   // legacy free-text column
        category_id:  row.category_id  || null,   // resolved FK (may be null)
        design:       row.design       || null,
        style:        row.style        || null,
        setting_type: row.setting_type || null,
      };

      const { error: insErr } = await supabase.from("inventory_products").insert(insertRow);
      if (insErr) { skipped.push({ name, reason: insErr.message }); continue; }

      created.push(name);
      createdNorm.add(nn);
    }

    return NextResponse.json({
      created:       created.length,
      created_names: created,
      skipped,
      skipped_count: skipped.length,
      imported_at:   new Date().toISOString(),
    });

  } catch (err) {
    console.error("[products-import/confirm]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed" }, { status: 500 });
  }
}
