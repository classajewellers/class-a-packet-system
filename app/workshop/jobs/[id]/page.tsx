"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { hasPermission, canManage } from "@/lib/userTypes";
import WorkshopJobDrawer, {
  type WorkshopPacket,
  type WorkshopConfig,
  type Profile,
} from "@/components/WorkshopJobDrawer";

const EMPTY_CONFIG: WorkshopConfig = {
  teamMembers: [],
  subcontractors: [],
  valuers: [],
  pathways: [],
  messages: [],
  leadTimes: [],
  categories: [],
  stages: [],
  locations: [],
};

async function resolvePacket(id: string, headers: Record<string, string>): Promise<WorkshopPacket | null> {
  const packetRes = await fetch(`/api/workshop/packets/${id}`, { cache: "no-store", headers });
  if (packetRes.ok) {
    const json = await packetRes.json() as { packet?: WorkshopPacket };
    if (json.packet?.id) return json.packet;
  }
  const jobRes = await fetch(`/api/workshop/jobs/${id}`, { cache: "no-store", headers });
  if (!jobRes.ok) return null;
  const jobJson = await jobRes.json() as { job?: { packet_id?: string | null } };
  const packetId = jobJson.job?.packet_id;
  if (!packetId || packetId === id) return null;
  const linkedRes = await fetch(`/api/workshop/packets/${packetId}`, { cache: "no-store", headers });
  if (!linkedRes.ok) return null;
  const linkedJson = await linkedRes.json() as { packet?: WorkshopPacket };
  return linkedJson.packet?.id ? linkedJson.packet : null;
}

export default function WorkshopJobPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user, hydrated } = useUser();
  const tenantId = user?.tenantId ?? "";
  const isManager = canManage(user?.role ?? null);

  const [packet, setPacket] = useState<WorkshopPacket | null>(null);
  const [config, setConfig] = useState<WorkshopConfig>(EMPTY_CONFIG);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "workshop")) router.replace("/");
  }, [user, hydrated, router]);

  useEffect(() => {
    if (!tenantId || !id) return;
    let cancelled = false;
    const headers = { "x-tenant-id": tenantId };

    resolvePacket(id, headers)
      .then(found => {
        if (cancelled) return;
        if (!found) { setError("This job could not be opened."); return; }
        setPacket(found);
      })
      .catch(() => { if (!cancelled) setError("This job could not be opened."); });

    fetch("/api/workshop/config", { cache: "no-store", headers })
      .then(r => r.json())
      .then(json => {
        if (cancelled || !json || json.error) return;
        setConfig({
          teamMembers:    json.teamMembers    ?? [],
          subcontractors: json.subcontractors ?? [],
          valuers:        json.valuers        ?? [],
          pathways:       json.pathways       ?? [],
          messages:       json.messages       ?? [],
          leadTimes:      json.leadTimes      ?? [],
          categories:     json.categories     ?? [],
          stages:         json.stages         ?? [],
          locations:      json.locations      ?? [],
          settings:       json.settings,
        });
      })
      .catch(() => {});

    fetch("/api/profiles", { cache: "no-store", headers })
      .then(r => r.json())
      .then(json => { if (!cancelled) setProfiles(json.profiles ?? []); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [tenantId, id]);

  if (!hydrated || !user) return null;

  if (!packet) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#6B7280", fontSize: 14 }}>
        {error ?? "Opening job…"}
      </div>
    );
  }

  return (
    <WorkshopJobDrawer
      packet={packet}
      config={config}
      profiles={profiles}
      isManager={isManager}
      tenantId={tenantId}
      onClose={() => router.push("/workshop/board")}
      onUpdate={setPacket}
      onDelete={() => {}}
    />
  );
}
