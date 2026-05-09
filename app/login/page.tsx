"use client";

import Image from "next/image";
import { STAFF_LIST, StaffMember } from "@/lib/staffList";
import { LoggedInUser, UserRole } from "@/lib/userTypes";
import { useUser } from "@/context/UserContext";
import StaffTile from "@/components/StaffTile";

const ROLE_SECTION_ORDER: UserRole[] = ["manager", "staff"];

const ROLE_SECTION_LABELS: Record<UserRole, string> = {
  manager: "Managers",
  staff:   "Staff",
};

export default function LoginPage() {
  const { login } = useUser();

  function handleSelect(member: StaffMember) {
    const user: LoggedInUser = {
      name:        member.name,
      role:        member.role,
      email:       member.email,
      initials:    member.initials,
      loggedInAt:  new Date().toISOString(),
    };
    login(user);
    // Navigation to "/" is handled by AuthGuard in ClientProviders
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-[#A3B2A4] shadow-md">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <Image
            src="/class-a-logo.png"
            alt="Class A Jewellers"
            width={160}
            height={40}
            className="h-[40px] w-auto object-contain"
            priority
          />
          <div className="text-white/70 text-sm font-medium hidden sm:block">
            Class A Order System
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-10">

        <h1 className="text-3xl font-bold text-black text-center mb-1">
          Who&apos;s serving today?
        </h1>
        <p className="text-sm text-gray-500 text-center mb-10">
          Tap your name to log in
        </p>

        {/* Sections by role */}
        {ROLE_SECTION_ORDER.map((role) => {
          const members = STAFF_LIST.filter((m) => m.role === role);
          if (members.length === 0) return null;
          return (
            <section key={role} className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  {ROLE_SECTION_LABELS[role]}
                </h2>
                <div className="flex-1 border-t border-gray-200" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {members.map((member) => (
                  <StaffTile
                    key={member.name}
                    member={member}
                    onClick={handleSelect}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </main>

      {/* ── Footer ── */}
      <footer className="text-center py-4 text-xs text-gray-400">
        Class A Jewellers · 40 North East Road, Walkerville SA 5081
      </footer>
    </div>
  );
}
