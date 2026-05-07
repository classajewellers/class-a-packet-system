"use client";

import { Packet, PacketType } from "@/lib/types";
import { formatDateAU, packetTypeLabel } from "@/lib/formatters";

interface Props {
  packets: Packet[];
  onRowClick: (packet: Packet) => void;
}

function StatusDot({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      title={label}
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        on ? "bg-green-500" : "bg-gray-300"
      }`}
    />
  );
}

const TYPE_BADGE: Record<PacketType, string> = {
  repair: "bg-blue-100 text-blue-800",
  custom_order: "bg-purple-100 text-purple-800",
  layby: "bg-amber-100 text-amber-800",
  client_intake: "bg-teal-100 text-teal-800",
  online_order: "bg-gray-900 text-white",
};

export default function AdminTable({ packets, onRowClick }: Props) {
  if (packets.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
        <p className="text-sm">No packets found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="pb-3 pr-4 font-semibold text-black whitespace-nowrap">Reference No.</th>
            <th className="pb-3 pr-4 font-semibold text-black">Type</th>
            <th className="pb-3 pr-4 font-semibold text-black">Customer</th>
            <th className="pb-3 pr-4 font-semibold text-black whitespace-nowrap">Due Date</th>
            <th className="pb-3 pr-4 font-semibold text-black">Staff</th>
            <th className="pb-3 pr-4 font-semibold text-black whitespace-nowrap">Created</th>
            <th className="pb-3 font-semibold text-black">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {packets.map((p) => {
            const customerName = [p.customer_first_name, p.customer_last_name]
              .filter(Boolean)
              .join(" ") || "—";
            const created = new Date(p.created_at).toLocaleDateString("en-AU", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });

            return (
              <tr
                key={p.id}
                onClick={() => onRowClick(p)}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="py-3 pr-4">
                  <span className="font-mono text-xs font-semibold text-black">
                    {p.reference_number}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      TYPE_BADGE[p.packet_type] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {packetTypeLabel(p.packet_type)}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <div className="font-medium text-black">{customerName}</div>
                  <div className="text-xs text-gray-400">{p.customer_phone ?? ""}</div>
                </td>
                <td className="py-3 pr-4 whitespace-nowrap text-gray-700">
                  {p.due_date ? formatDateAU(p.due_date) : "—"}
                </td>
                <td className="py-3 pr-4 text-gray-700">{p.staff_member ?? "—"}</td>
                <td className="py-3 pr-4 whitespace-nowrap text-gray-500 text-xs">{created}</td>
                <td className="py-3">
                  <div className="flex gap-1.5 items-center" title="Label · Klaviyo · Email · SMS · Sheets">
                    <StatusDot on={p.label_printed} label="Label" />
                    <StatusDot on={p.klaviyo_synced} label="Klaviyo" />
                    <StatusDot on={p.email_sent} label="Email" />
                    <StatusDot on={p.sms_sent} label="SMS" />
                    <StatusDot on={p.sheets_logged} label="Sheets" />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
