"use client";

import { useEffect, useState } from "react";
import { PacketFormData } from "@/lib/types";
import { useUser } from "@/context/UserContext";
import { activeWorkshopStaffNames, type WorkshopTeamMember } from "@/lib/jobStaff";

const REFERRAL_SOURCES = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "website", label: "Website" },
  { value: "word_of_mouth", label: "Word of Mouth" },
  { value: "walk_in", label: "Walk-in" },
  { value: "existing_customer", label: "Existing Customer" },
  { value: "other", label: "Other" },
];

interface Props {
  data: PacketFormData;
  onChange: (field: keyof PacketFormData, value: string) => void;
  errors: Partial<Record<keyof PacketFormData, string>>;
}

const LOAD_FAILED = "Staff list failed to load. This is not an empty roster.";

type StaffLoad =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; names: string[] };

function useWorkshopStaff(): StaffLoad {
  const { user } = useUser();
  const tenantId = user?.tenantId;
  const [state, setState] = useState<StaffLoad>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (!tenantId) {
      setState({ status: "error", message: LOAD_FAILED });
      return;
    }
    setState({ status: "loading" });
    fetch("/api/workshop/team-members", {
      headers: { "x-tenant-id": tenantId },
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { members?: WorkshopTeamMember[]; error?: string } | null;
        if (cancelled) return;
        if (!response.ok || !body || !Array.isArray(body.members)) {
          setState({ status: "error", message: LOAD_FAILED });
          return;
        }
        setState({ status: "ready", names: activeWorkshopStaffNames(body.members) });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: LOAD_FAILED });
      });
    return () => { cancelled = true; };
  }, [tenantId]);

  return state;
}

export default function ReferralStaffSection({ data, onChange, errors }: Props) {
  const staff = useWorkshopStaff();
  const names = staff.status === "ready" ? staff.names : [];
  const selectClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-black mb-1">
            How did you find us?
          </label>
          <select
            value={data.referral_source}
            onChange={(e) => onChange("referral_source", e.target.value)}
            className={selectClass}
          >
            <option value="">— Select —</option>
            {REFERRAL_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-black mb-1">
            Occasion
          </label>
          <input
            type="text"
            value={data.occasion}
            onChange={(e) => onChange("occasion", e.target.value)}
            placeholder="e.g. Birthday, Engagement"
            className={selectClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-black mb-1">
          Staff Member<span className="text-black ml-0.5">*</span>
        </label>
        <select
          value={data.staff_member}
          onChange={(e) => onChange("staff_member", e.target.value)}
          disabled={staff.status !== "ready"}
          className={`
            w-full rounded-lg border px-3 py-2.5 text-sm text-black
            focus:outline-none focus:ring-2 focus:ring-black focus:border-black
            ${errors.staff_member || staff.status === "error" ? "border-red-500 bg-red-50" : "border-gray-300 bg-white"}
          `}
        >
          <option value="">
            {staff.status === "loading" ? "Loading staff…" : "— Select —"}
          </option>
          {names.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {staff.status === "error" && (
          <p className="mt-1 text-xs text-red-600">{staff.message}</p>
        )}
        {staff.status === "ready" && names.length === 0 && (
          <p className="mt-1 text-xs text-amber-700">No active workshop staff are saved for this store.</p>
        )}
        {errors.staff_member && (
          <p className="mt-1 text-xs text-red-600">{errors.staff_member}</p>
        )}
      </div>
    </div>
  );
}
