"use client";

// lib/useStaff.ts
// Tenant-scoped staff list for staff pickers (PIN modal, quote/packet/referral
// assigned-to dropdowns). Replaces the hardcoded STAFF_LIST/STAFF_NAMES, which
// leaked Class A staff to every tenant. Fetches /api/staff (guarded, service-
// role, tenant-scoped); pin_hash is never exposed.

import { useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";

export interface StaffOption {
  name: string;
  role: string;
}

export function useStaff(): { staff: StaffOption[]; names: string[]; loading: boolean } {
  const { user } = useUser();
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const tenantId = user?.tenantId;

  useEffect(() => {
    let cancelled = false;
    if (!tenantId) { setStaff([]); setLoading(false); return; }
    setLoading(true);
    fetch("/api/staff", { headers: { "x-tenant-id": tenantId }, cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setStaff((d.staff ?? []) as StaffOption[]); })
      .catch(() => { if (!cancelled) setStaff([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  return { staff, names: staff.map((s) => s.name), loading };
}
