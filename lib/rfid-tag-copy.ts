import type { SupabaseClient } from "@supabase/supabase-js";
import { tenantScoped } from "@/lib/tenantScoped";
import { resolveStoneShape, type TagCopy } from "@/lib/rfid-label";

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function missingColumn(error: { code?: string; message?: string } | null | undefined, column: string): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes(column) && (message.includes("column") || message.includes("schema"));
}

async function optionalText(
  supabase: SupabaseClient,
  tenantId: string,
  table: string,
  id: string,
  column: string,
): Promise<string | null> {
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from(table)
    .select(column)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (missingColumn(error, column)) return null;
    throw new Error(error.message);
  }
  const row = data as Record<string, unknown> | null;
  return asText(row?.[column]);
}

/**
 * Fields the flag layout needs. Shape is stone_shape when that column
 * exists, otherwise the variant's stone_shape, otherwise a shape word
 * written in other_specs. Price is not loaded.
 */
export async function loadTagCopy(
  supabase: SupabaseClient,
  tenantId: string,
  pieceId: string,
  piece: {
    sku?: string | null;
    metal_karat?: string | null;
    metal_colour?: string | null;
    diamond_carat?: number | string | null;
    diamond_type?: string | null;
    finger_size?: string | null;
    other_specs?: string | null;
  },
): Promise<TagCopy> {
  let stoneShape: string | null = null;
  let variantShape: string | null = null;
  try {
    stoneShape = await optionalText(supabase, tenantId, "inventory_pieces", pieceId, "stone_shape");
    const variantId = await optionalText(supabase, tenantId, "inventory_pieces", pieceId, "variant_id");
    if (variantId) {
      variantShape = await optionalText(supabase, tenantId, "inventory_product_variants", variantId, "stone_shape");
    }
  } catch (err) {
    throw err instanceof Error ? err : new Error("Could not load the stone shape");
  }

  let otherSpecs = asText(piece.other_specs);
  if (otherSpecs == null && !("other_specs" in piece)) {
    try {
      otherSpecs = await optionalText(supabase, tenantId, "inventory_pieces", pieceId, "other_specs");
    } catch (err) {
      throw err instanceof Error ? err : new Error("Could not load other specs");
    }
  }

  const metal = [asText(piece.metal_karat), asText(piece.metal_colour)].filter(Boolean).join(" ");
  return {
    sku: asText(piece.sku) ?? "",
    metal: metal || null,
    carat: piece.diamond_carat ?? null,
    shape: resolveStoneShape({ stoneShape, variantShape, otherSpecs }),
    diamondType: asText(piece.diamond_type),
    fingerSize: asText(piece.finger_size),
  };
}
