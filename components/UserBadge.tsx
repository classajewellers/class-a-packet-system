"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";

export default function UserBadge() {
  const { user, logout } = useUser();
  const router = useRouter();

  if (!user) return null;

  function handleSwitch() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="flex items-center gap-2">
      {/* Initials circle */}
      <div className="w-8 h-8 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        {user.initials}
      </div>

      {/* Name — hidden on very small screens */}
      <span className="hidden sm:block text-sm font-semibold text-white leading-none">
        {user.name}
      </span>

      {/* Switch button */}
      <button
        type="button"
        onClick={handleSwitch}
        className="
          flex items-center gap-1 rounded-lg border border-white/30
          px-2.5 py-1.5 text-xs font-semibold text-white
          hover:bg-white/10 transition-colors
        "
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        Switch
      </button>
    </div>
  );
}
