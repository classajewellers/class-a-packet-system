import { NextRequest, NextResponse } from "next/server"
import { createTenantSupabaseClient } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? ""
    const supabase = await createTenantSupabaseClient(tenantId)

    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const allowedFields = [
      "workshop_due_date",
      "workshop_due_date_overridden",
      "workshop_supplier",
      "workshop_supplier_sent_date",
      "workshop_supplier_expected_return",
      "workshop_supplier_returned",
    ] as const

    const updates: Partial<Record<(typeof allowedFields)[number], unknown>> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    const { error } = await supabase
      .from("packets")
      .update(updates)
      .eq("id", params.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
