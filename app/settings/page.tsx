"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { STAFF_LIST, ROLE_LABELS } from "@/lib/staffList";

export default function SettingsPage() {
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== "manager") {
      router.replace("/orders");
    }
  }, [user, router]);

  if (!user || user.role !== "manager") return null;

  const storeName = process.env.NEXT_PUBLIC_STORE_NAME ?? "Class A Jewellers";
  const storePhone = process.env.NEXT_PUBLIC_STORE_PHONE ?? "(08) 8344 7722";
  const storeEmail = process.env.NEXT_PUBLIC_STORE_EMAIL ?? "customercare@classa.com.au";
  const storeAddress = process.env.NEXT_PUBLIC_STORE_ADDRESS ?? "40 North East Road, Walkerville SA 5081";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Store Details */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #E8E8F0', background: '#1A1760' }}>
          <h2 style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Store Details</h2>
        </div>
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: "Store Name", value: storeName },
            { label: "Phone", value: storePhone },
            { label: "Email", value: storeEmail },
            { label: "Address", value: storeAddress },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#1A1A2E' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Staff List */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #E8E8F0', background: '#1A1760' }}>
          <h2 style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Staff ({STAFF_LIST.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #E8E8F0', background: '#F9FAFB' }}>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</th>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Role</th>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</th>
              </tr>
            </thead>
            <tbody>
              {STAFF_LIST.map((member) => (
                <tr key={member.name} style={{ borderBottom: '1px solid #E8E8F0' }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                  <td style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#635BFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {member.initials}
                    </div>
                    <span style={{ fontWeight: 500, color: '#1A1A2E' }}>{member.name}</span>
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{ display: 'inline-flex', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, background: member.role === "manager" ? '#635BFF' : '#E5E7EB', color: member.role === "manager" ? '#fff' : '#374151' }}>
                      {ROLE_LABELS[member.role]}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px', color: '#6B7280', fontSize: 14 }}>{member.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* About */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderRadius: 12, padding: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>About</p>
        <p style={{ fontSize: 14, fontWeight: 500, color: '#1A1A2E' }}>Class A Order System v1.0</p>
        <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>Internal repair and order management system for Class A Jewellers</p>
      </div>
    </div>
  );
}
