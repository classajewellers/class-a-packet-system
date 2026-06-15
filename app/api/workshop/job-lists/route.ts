import { NextRequest, NextResponse } from "next/server"
import { createTenantSupabaseClient } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type") as "major" | "minor" | null
    const tenantId = req.headers.get("x-tenant-id") ?? ""

    const supabase = await createTenantSupabaseClient(tenantId)

    const packetType = type === "major" ? "custom_order" : "repair"

    const { data, error } = await supabase
      .from("packets")
      .select(
        "id, reference_number, in_date, customer_last_name, instructions, articles, product_category, staff_member, workshop_due_date, workshop_due_date_overridden, manufacture_type, job_complexity, workshop_supplier, collected_date, packet_type"
      )
      .eq("packet_type", packetType)
      .order("in_date", { ascending: true })
      .order("id", { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ jobs: data ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
