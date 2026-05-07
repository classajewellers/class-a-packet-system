"use client";

import { useState } from "react";
import { Packet } from "@/lib/types";
import { formatDateAU, formatCurrency, packetTypeLabel } from "@/lib/formatters";
import { generatePrintHTML } from "@/lib/labelGenerator";

interface Props {
  packet: Packet;
  onClose: () => void;
  onRetry: (
    packetId: string,
    output: "klaviyo" | "email" | "sms" | "sheets" | "label"
  ) => Promise<void>;
}

function Field({ label, value }: { label: string; value?: string | null | boolean }) {
  if (value === null || value === undefined || value === "") return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{label}</dt>
      <dd className="text-sm text-black mt-0.5">{display}</dd>
    </div>
  );
}

export default function PacketDetailDrawer({ packet, onClose }: Props) {
  const [localPacket] = useState(packet);

  const customerName = [localPacket.customer_first_name, localPacket.customer_last_name]
    .filter(Boolean)
    .join(" ");

  const addressLine = [
    localPacket.customer_street,
    localPacket.customer_suburb,
    localPacket.customer_state,
    localPacket.customer_postcode,
  ]
    .filter(Boolean)
    .join(", ");

  const isOnline = localPacket.packet_type === "online_order";

  function handleReprintLabel() {
    const html = generatePrintHTML(localPacket);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-md bg-white shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <p className="text-xs text-gray-500">{packetTypeLabel(localPacket.packet_type)}</p>
            <h2 className="font-mono text-base font-bold text-black">
              {localPacket.reference_number}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">
          {/* Reprint Label */}
          <button
            onClick={handleReprintLabel}
            className="w-full flex items-center justify-center gap-2 bg-black text-white text-sm font-semibold py-3 rounded-xl hover:bg-[#222222] active:scale-[0.98] transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            Reprint Label
          </button>

          {/* Customer */}
          <Section title="Customer">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Name" value={customerName} />
              <Field label="Phone" value={localPacket.customer_phone} />
              <Field label="Email" value={localPacket.customer_email} />
              <Field label="Customer #" value={localPacket.customer_number} />
              <Field label="Address" value={addressLine || null} />
              <Field label="Stock #" value={localPacket.stock_number} />
            </dl>
          </Section>

          {/* Value & Contact */}
          <Section title="Value & Contact">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Valuation Required" value={localPacket.valuation_required} />
              <Field
                label="Contact Pref."
                value={(localPacket.contact_preference ?? []).join(", ") || null}
              />
            </dl>
          </Section>

          {/* Articles */}
          <Section title="Articles & Instructions">
            <dl className="space-y-3">
              <Field label="Articles" value={localPacket.articles} />
              <Field label="Instructions" value={localPacket.instructions} />
            </dl>
          </Section>

          {/* Online Order fields */}
          {isOnline && (
            <Section title="Online Order">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Order #" value={localPacket.order_number} />
                <Field label="Order Source" value={localPacket.order_source} />
                <Field label="Shipping Method" value={localPacket.shipping_method} />
                <Field label="Tracking #" value={localPacket.tracking_number} />
                <Field label="Items Ordered" value={localPacket.items_ordered} />
                <Field label="Order Notes" value={localPacket.order_notes} />
                {!localPacket.shipping_address_same && (
                  <Field
                    label="Ship Address"
                    value={[
                      localPacket.shipping_street,
                      localPacket.shipping_suburb,
                      localPacket.shipping_state,
                      localPacket.shipping_postcode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  />
                )}
              </dl>
            </Section>
          )}

          {/* Pricing */}
          <Section title="Pricing">
            <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
              <Field label="Total" value={formatCurrency(localPacket.total_charges)} />
              <Field label="Deposit" value={formatCurrency(localPacket.deposit)} />
              <Field label="Balance" value={formatCurrency(localPacket.balance)} />
            </dl>
          </Section>

          {/* Dates */}
          <Section title="Dates">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="In Date" value={formatDateAU(localPacket.in_date)} />
              <Field label="Due Date" value={formatDateAU(localPacket.due_date)} />
              <Field label="From Date" value={formatDateAU(localPacket.from_date)} />
              <Field label="Collected" value={formatDateAU(localPacket.collected_date)} />
            </dl>
          </Section>

          {/* Referral & Staff */}
          <Section title="Referral & Staff">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Referral" value={localPacket.referral_source} />
              <Field label="Occasion" value={localPacket.occasion} />
              <Field label="Staff" value={localPacket.staff_member} />
              <Field label="Repair Tracker" value={localPacket.repair_tracker_number} />
              <Field label="Signed By" value={localPacket.signed_by} />
            </dl>
          </Section>

          {/* Extra data */}
          {localPacket.packet_data && Object.keys(localPacket.packet_data).length > 0 && (
            <Section title="Additional Details">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {Object.entries(localPacket.packet_data).map(([k, v]) => (
                  <Field
                    key={k}
                    label={k.replace(/_/g, " ")}
                    value={
                      Array.isArray(v)
                        ? v.join(", ")
                        : typeof v === "boolean"
                        ? v
                        : String(v ?? "")
                    }
                  />
                ))}
              </dl>
            </Section>
          )}

          <p className="text-xs text-gray-400 pb-2">
            Created {new Date(localPacket.created_at).toLocaleString("en-AU")}
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-1">
        {title}
      </p>
      {children}
    </div>
  );
}
