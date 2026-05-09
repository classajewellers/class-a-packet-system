"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/context/UserContext";
import UserBadge from "@/components/UserBadge";

const NAV_LINKS = [
  { href: "/",        label: "New Order",  minRole: null },
  { href: "/quote",   label: "New Quote",  minRole: null },
  { href: "/admin",   label: "Admin",      minRole: null },
  { href: "/revenue", label: "Revenue",    minRole: "manager" }, // hidden for staff
] as const;

export default function NavBar() {
  const pathname = usePathname();
  const { user } = useUser();

  const visibleLinks = NAV_LINKS.filter((link) => {
    if (!link.minRole) return true;
    if (!user) return false;
    if (link.minRole === "manager") return user.role === "admin" || user.role === "manager";
    return true;
  });

  return (
    <header className="sticky top-0 z-30 bg-[#A3B2A4] shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/">
            <Image
              src="/class-a-logo.png"
              alt="Class A Jewellers"
              width={144}
              height={36}
              className="h-[36px] w-auto object-contain"
            />
          </Link>
          <nav className="flex items-center gap-1">
            {visibleLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 text-sm font-semibold text-white rounded transition-colors hover:bg-white/10 ${
                    isActive ? "border-b-2 border-white" : ""
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Logged-in user */}
        <UserBadge />
      </div>
    </header>
  );
}
