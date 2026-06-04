"use client";

import { StaffMember, ROLE_LABELS } from "@/lib/staffList";

interface Props {
  member: StaffMember;
  onClick: (member: StaffMember) => void;
}

const ROLE_BADGE_STYLES: Record<string, string> = {
  manager: "bg-[#635BFF] text-white",
  staff:   "bg-gray-200 text-gray-700",
};

export default function StaffTile({ member, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={() => onClick(member)}
      className="
        flex flex-col items-center justify-center gap-3 p-5
        bg-white rounded-2xl border-2 border-gray-200
        hover:border-[#635BFF] hover:shadow-md
        active:scale-[0.97] active:bg-gray-50
        transition-all duration-150 min-h-[160px] w-full
        focus:outline-none focus:ring-2 focus:ring-[#635BFF] focus:ring-offset-2
      "
    >
      {/* Initials circle */}
      <div className="
        w-16 h-16 rounded-full bg-[#635BFF] flex items-center justify-center
        text-white text-xl font-bold tracking-wide flex-shrink-0
      ">
        {member.initials}
      </div>

      {/* Name */}
      <span className="text-sm font-semibold text-black text-center leading-tight">
        {member.name}
      </span>

      {/* Role badge */}
      <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full ${member.role ? ROLE_BADGE_STYLES[member.role] : "bg-gray-200 text-gray-400"}`}>
        {member.role ? ROLE_LABELS[member.role] : "—"}
      </span>
    </button>
  );
}
