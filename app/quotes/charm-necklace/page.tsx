"use client";

export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { hasPermission } from "@/lib/userTypes";
import { useEffect } from "react";

export default function CharmNecklacePage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "quotes")) router.replace("/");
  }, [user, hydrated, router]);

  return (
    <div style={{ padding: "40px 32px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", background: "#EDE9FE", color: "#4C1D95", padding: "2px 10px", borderRadius: 10 }}>
            CLASS A CUSTOM
          </span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1A1760", margin: "0 0 8px" }}>
          Charm Necklace / Bracelet
        </h1>
        <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>
          Configure a personalised charm necklace or bracelet for a customer quote.
        </p>
      </div>

      <div style={{
        background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12,
        padding: 32, textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✦</div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#1A1760", marginBottom: 8 }}>
          Charm Builder Coming Soon
        </p>
        <p style={{ fontSize: 13, color: "#9CA3AF", maxWidth: 380, margin: "0 auto 20px" }}>
          Use the <strong>Build Quote</strong> page to configure charm necklaces and bracelets.
          Click the <em>Add Charm Necklace</em> or <em>Add Charm Bracelet</em> button inside the quote builder.
        </p>
        <button
          onClick={() => router.push("/quotes/builder")}
          style={{
            background: "#635BFF", color: "#fff", border: "none",
            borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          Open Quote Builder →
        </button>
      </div>
    </div>
  );
}
