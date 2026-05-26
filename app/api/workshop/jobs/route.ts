import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { trackFromJobType } from "@/lib/workshopConfig";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");

  try {
    const supabase = createServerSupabaseClient();
    let query = supabase
      .from("workshop_jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (stage) {
      query = query.eq("stage", stage);
    } else {
      // Exclude completed by default
      query = query.neq("stage", "completed");
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json({ jobs: [] });
      }
      return NextResponse.json({ jobs: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ jobs: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ jobs: [], error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const supabase = createServerSupabaseClient();

    // Auto-derive track from job_type if not explicitly provided
    const track = body.track ?? trackFromJobType(body.job_type ?? "repair");

    // New jobs always land in the SR Job Drawer unless a stage is specified
    const stage = body.stage ?? "sr_job_drawer";

    const { data, error } = await supabase
      .from("workshop_jobs")
      .insert({
        ...body,
        stage,
        track,
        stage_changed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ job: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
