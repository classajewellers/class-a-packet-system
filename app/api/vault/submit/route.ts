import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a product intelligence assistant for Vault, a jewellery store management platform. A staff member has submitted a report. Your job is to extract structured information from their raw description. Return ONLY a valid JSON object with these fields: title (short descriptive title, max 8 words), area (which part of the app this relates to — one of: Orders, Workshop, Packets, Customers, Quotes, Inventory, Reporting, Pricing, Settings, General), priority (one of: Low, Medium, High, Critical), summary (one clean sentence describing the issue or idea), and tags (array of 1-3 relevant keywords).`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Parse multipart form data
    const formData = await req.formData();
    const type = formData.get("type") as string;
    const description = formData.get("description") as string;
    const image = formData.get("image") as File | null;
    const submittedBy = formData.get("submitted_by") as string | null;

    if (!type || !description) {
      return NextResponse.json({ error: "type and description are required" }, { status: 400 });
    }

    // Call Claude to extract structured info
    let structured = { title: null as string | null, area: "General", priority: "Medium", summary: description, tags: [] as string[] };
    try {
      const msg = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Type: ${type}\n\nDescription: ${description}` }],
      });
      const raw = (msg.content[0] as { text: string }).text.trim();
      // Strip markdown code fences if present
      const jsonStr = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(jsonStr);
      structured = { title: parsed.title ?? null, area: parsed.area ?? "General", priority: parsed.priority ?? "Medium", summary: parsed.summary ?? description, tags: parsed.tags ?? [] };
    } catch (aiErr) {
      console.warn("[vault/submit] Claude parse failed:", aiErr);
    }

    // Upload image to Supabase Storage if provided
    let imageUrl: string | null = null;
    if (image && image.size > 0) {
      try {
        const tenantId = req.headers.get('x-tenant-id') ?? ''
        const supabase = await createTenantSupabaseClient(tenantId);
        const bytes = await image.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const ext = image.name.split(".").pop() ?? "png";
        const filename = `vault-reports/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("vault-screenshots").upload(filename, buffer, { contentType: image.type });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("vault-screenshots").getPublicUrl(filename);
          imageUrl = urlData.publicUrl;
        } else {
          console.warn("[vault/submit] Image upload failed:", uploadErr.message);
        }
      } catch (imgErr) {
        console.warn("[vault/submit] Image upload error:", imgErr);
      }
    }

    // Insert into vault_reports
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data, error } = await supabase.from("vault_reports").insert({
      type,
      raw_description: description,
      title: structured.title,
      area: structured.area,
      priority: structured.priority,
      summary: structured.summary,
      tags: structured.tags,
      image_url: imageUrl,
      submitted_by: submittedBy ?? null,
      tenant_id: tenantId,
    }).select().single();

    if (error) {
      console.error("[vault/submit] Insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, report: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[vault/submit] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
