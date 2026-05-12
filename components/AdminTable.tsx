"use client";

import { Packet, PacketType } from "@/lib/types";
import { formatDateAU, packetTypeLabel } from "@/lib/formatters";

interface Props {
  packets: Packet[];
  onRowClick: (packet: Packet) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

const TYPE_BADGE: Record<PacketType, { cls: string; label?: string }> = {
  repair:        { cls: "ds-badge ds-badge-orange" },
  custom_order:  { cls: "ds-badge ds-badge-violet" },
  layby:         { cls: "ds-badge ds-badge-amber" },
  client_intake: { cls: "ds-badge ds-badge-teal" },
  online_order:  { cls: "ds-badge ds-badge-green" },
};

export default function AdminTable({ packets, onRowClick, selectedIds, onSelectionChange }: Props) {
  const safePackets = packets ?? [];
  const selectable = !!onSelectionChange;
  const allSelected = selectable && safePackets.length > 0 && safePackets.every((p) => selectedIds?.has(p.id));
  const someSelected = selectable && safePackets.some((p) => selectedIds?.has(p.id));

  function toggleAll() {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(safePackets.map((p) => p.id)));
    }
  }

  function toggleOne(id: string) {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  }

  if (safePackets.length === 0) {
    return (
      <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
        <svg className="w-12 h-12 mx-auto mb-3" style={{ opacity: 0.2 }} fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
        <p className="text-sm">No orders found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="ds-t w-full">
        <thead>
          <tr>
            {selectable && (
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded cursor-pointer"
                  style={{ accentColor: "var(--violet)" }}
                />
              </th>
            )}
            <th>Reference</th>
            <th>Type</th>
            <th>Customer</th>
            <th>Due Date</th>
            <th>Staff</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {safePackets.map((p) => {
            const isSelected = selectedIds?.has(p.id) ?? false;
            const customerName = [p.customer_first_name, p.customer_last_name]
              .filter(Boolean).join(" ") || "—";
            const created = new Date(p.created_at).toLocaleDateString("en-AU", {
              day: "2-digit", month: "short", year: "numeric",
            });
            const badge = TYPE_BADGE[p.packet_type] ?? { cls: "ds-badge ds-badge-muted" };

            return (
              <tr
                key={p.id}
                onClick={() => onRowClick(p)}
                style={isSelected ? { background: "rgba(124,106,254,0.08)" } : {}}
              >
                {selectable && (
                  <td onClick={(e) => { e.stopPropagation(); toggleOne(p.id); }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(p.id)}
                      className="h-4 w-4 rounded cursor-pointer"
                      style={{ accentColor: "var(--violet)" }}
                    />
                  </td>
                )}
                <td>
                  <span className="ds-mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {p.reference_number}
                  </span>
                </td>
                <td>
                  <span className={badge.cls}>{packetTypeLabel(p.packet_type)}</span>
                </td>
                <td>
                  <div style={{ fontWeight: 500, color: "var(--text)" }}>{customerName}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{p.customer_phone ?? ""}</div>
                </td>
                <td style={{ color: "var(--text-2)" }}>
                  {p.due_date ? formatDateAU(p.due_date) : "—"}
                </td>
                <td style={{ color: "var(--text-2)" }}>{p.staff_member ?? "—"}</td>
                <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{created}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
