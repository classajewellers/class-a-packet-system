"use client";

export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { hasPermission } from "@/lib/userTypes";
import { useEffect } from "react";

export default function ProductTemplatesPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "inventory")) router.replace("/");
  }, [user, hydrated, router]);

  return (
    <div style={{ padding: "40px 32px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1A1760", margin: "0 0 8px" }}>
          Product Templates
        </h1>
        <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>
          Reusable product templates for faster inventory management.
        </p>
      </div>

      <div style={{
        background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12,
        padding: 32, textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#1A1760", marginBottom: 8 }}>
          Coming Soon
        </p>
        <p style={{ fontSize: 13, color: "#9CA3AF", maxWidth: 380, margin: "0 auto" }}>
          Product templates will allow you to create reusable item definitions
          that can be applied when adding new stock to your inventory.
        </p>
      </div>
    </div>
  );
}
