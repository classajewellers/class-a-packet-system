import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { profileIsCadDesigner, pathwayStepUpdate } from "@/lib/cadAccess";
import { CAD_APPROVAL_STATUS, CAD_DESIGN_STATUS, cadRenderError, cadSourceError, fileExtension } from "@/lib/cadStage";

export const dynamic = "force-dynamic";

async function loadPacket(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  tenantId: string,
  packetId: string
) {
  const { data, error } = await supabase
    .from("packets")
    .select("id, status, pending_customer_approval, cad_required, workshop_pathway_id")
    .eq("tenant_id", tenantId)
    .eq("id", packetId)
    .maybeSingle();
  return { packet: data, error };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const { packet, error: packetErr } = await loadPacket(supabase, tenantId, params.id);
    if (packetErr) return NextResponse.json({ error: packetErr.message }, { status: 500 });
    if (!packet) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("packet_cad_versions")
      .select("id, version_number, status, note, decision_note, render_filename, source_filename, render_storage_path, source_storage_path, created_at, decided_at")
      .eq("tenant_id", tenantId)
      .eq("packet_id", params.id)
      .order("version_number", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const drivingVersion = (data ?? []).reduce((best, row) => {
      if (row.status !== "approved") return best;
      if (!best || row.version_number > best) return row.version_number;
      return best;
    }, 0);
    const versions = (data ?? []).map((row) => ({
      ...row,
      drives_casting: row.status === "approved" && row.version_number === drivingVersion,
    }));
    return NextResponse.json({ versions, cad_required: packet.cad_required === true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId, role } = auth.ctx;

  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const isManager = role === "manager" || role === "admin";
    const isDesigner = await profileIsCadDesigner(supabase, tenantId, userId);
    if (!isManager && !isDesigner) {
      return NextResponse.json(
        { error: "Only a CAD Designer, or a manager, can upload a CAD version." },
        { status: 403 }
      );
    }

    const { packet, error: packetErr } = await loadPacket(supabase, tenantId, params.id);
    if (packetErr) return NextResponse.json({ error: packetErr.message }, { status: 500 });
    if (!packet) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (packet.pending_customer_approval) {
      return NextResponse.json(
        { error: "This order is pending manager approval. Approve it before uploading CAD." },
        { status: 422 }
      );
    }
    if (packet.status !== CAD_DESIGN_STATUS && packet.status !== CAD_APPROVAL_STATUS) {
      return NextResponse.json(
        { error: "Move the job to CAD Design before uploading a render and source file." },
        { status: 422 }
      );
    }

    const form = await req.formData();
    const render = form.get("render");
    const source = form.get("source");
    const note = String(form.get("note") ?? "").trim();
    if (!(render instanceof File) || !(source instanceof File)) {
      return NextResponse.json({ error: "Upload both a render and a source file." }, { status: 400 });
    }
    const renderErr = cadRenderError(render);
    if (renderErr) return NextResponse.json({ error: renderErr }, { status: 400 });
    const sourceErr = cadSourceError(source);
    if (sourceErr) return NextResponse.json({ error: sourceErr }, { status: 400 });

    const { data: latest, error: latestErr } = await supabase
      .from("packet_cad_versions")
      .select("version_number")
      .eq("tenant_id", tenantId)
      .eq("packet_id", params.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) return NextResponse.json({ error: latestErr.message }, { status: 500 });
    const versionNumber = (latest?.version_number ?? 0) + 1;

    await supabase.storage.createBucket("attachments", { public: false }).catch(() => {});

    const renderPath = await storeCadFile(supabase, tenantId, params.id, render);
    const sourcePath = await storeCadFile(supabase, tenantId, params.id, source);

    const renderAttachment = await insertAttachment(supabase, {
      tenantId,
      packetId: params.id,
      userId,
      file: render,
      path: renderPath,
      attachmentType: "photo",
      notes: `cad version ${versionNumber} render`,
    });
    const sourceAttachment = await insertAttachment(supabase, {
      tenantId,
      packetId: params.id,
      userId,
      file: source,
      path: sourcePath,
      attachmentType: "cad_file",
      notes: `cad version ${versionNumber} source`,
    });

    const { data: version, error: versionErr } = await supabase
      .from("packet_cad_versions")
      .insert({
        tenant_id: tenantId,
        packet_id: params.id,
        version_number: versionNumber,
        render_attachment_id: renderAttachment.id,
        source_attachment_id: sourceAttachment.id,
        render_storage_path: renderPath,
        render_filename: render.name,
        source_storage_path: sourcePath,
        source_filename: source.name,
        status: "pending",
        note: note || null,
        created_by: userId,
      })
      .select("id, version_number, status, note, decision_note, render_filename, source_filename, render_storage_path, source_storage_path, created_at, decided_at")
      .single();

    if (versionErr || !version) {
      await supabase.storage.from("attachments").remove([renderPath, sourcePath]);
      return NextResponse.json({ error: versionErr?.message ?? "Could not save the CAD version" }, { status: 500 });
    }

    let updatedPacket = null;
    if (packet.status === CAD_DESIGN_STATUS) {
      const packetUpdate: Record<string, unknown> = {
        status: CAD_APPROVAL_STATUS,
        workshop_intake_substatus: null,
        status_updated_at: new Date().toISOString(),
      };
      const step = await pathwayStepUpdate(supabase, tenantId, packet.workshop_pathway_id, CAD_APPROVAL_STATUS);
      if (step !== null) packetUpdate.workshop_step_index = step;
      const { data, error } = await supabase
        .from("packets")
        .update(packetUpdate)
        .eq("tenant_id", tenantId)
        .eq("id", params.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      updatedPacket = data;
    }

    return NextResponse.json({ version: { ...version, drives_casting: false }, packet: updatedPacket });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

async function storeCadFile(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  tenantId: string,
  packetId: string,
  file: File
): Promise<string> {
  const ext = fileExtension(file.name) || "bin";
  const storagePath = `${tenantId}/packet/${packetId}/cad/${crypto.randomUUID()}.${ext}`;
  const bytes = await file.arrayBuffer();
  const { error } = await supabase.storage.from("attachments").upload(storagePath, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return storagePath;
}

async function insertAttachment(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  args: {
    tenantId: string;
    packetId: string;
    userId: string;
    file: File;
    path: string;
    attachmentType: "photo" | "cad_file";
    notes: string;
  }
): Promise<{ id: string }> {
  const fileType = args.file.type.startsWith("image/") ? "image" : args.file.type === "application/pdf" ? "pdf" : "document";
  const { data, error } = await supabase
    .from("attachments")
    .insert({
      tenant_id: args.tenantId,
      entity_type: "packet",
      entity_id: args.packetId,
      file_name: args.file.name,
      file_url: args.path,
      file_type: fileType,
      file_size: args.file.size,
      uploaded_by: args.userId,
      attachment_type: args.attachmentType,
      notes: args.notes,
    })
    .select("id")
    .single();
  if (error || !data) {
    await supabase.storage.from("attachments").remove([args.path]);
    throw new Error(error?.message ?? "Could not save the file record");
  }
  return data;
}
