"use client";

import { PacketFormData, Packet } from "@/lib/types";
import { formatDateAU, formatCurrency, computeBalance, parseCurrency } from "@/lib/formatters";
import { generatePrintHTML } from "@/lib/labelGenerator";

interface Props {
  data: PacketFormData;
}

export default function LabelPreview({ data }: Props) {
  const balance = computeBalance(data.total_charges, data.deposit);

  function handlePrintLabel() {
    const packetPreview = {
      ...data,
      id: "",
      created_at: new Date().toISOString(),
      reference_number: "PREVIEW",
      total_charges: parseCurrency(data.total_charges),
      deposit: parseCurrency(data.deposit),
      balance,
      repair_tracker_number: null,
      from_date: null,
      collected_date: null,
      signed_by: null,
      klaviyo_synced: false,
      email_sent: false,
      sms_sent: false,
      label_printed: false,
      sheets_logged: false,
      packet_data: null,
    } as unknown as Packet;

    const html = generatePrintHTML(packetPreview);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }
  const customerName = [data.customer_first_name, data.customer_last_name]
    .filter(Boolean)
    .join(" ") || "—";
  const addressLine = [
    data.customer_street,
    data.customer_suburb,
    data.customer_state,
    data.customer_postcode,
  ]
    .filter(Boolean)
    .join(", ") || "—";
  const contactPref = data.contact_preference.join(", ") || "—";
  const dueDisplay = data.due_date ? formatDateAU(data.due_date) : "— / — / ——";
  const isOnline = data.packet_type === "online_order";

  return (
    <div>
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm text-[8px] leading-tight font-sans select-none">
      {/* Online Order Banner */}
      {isOnline && (
        <div className="bg-black px-3 py-1 text-center">
          <div className="text-[9px] font-bold text-white tracking-widest uppercase">
            ONLINE ORDER
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-[#A3B2A4] px-3 py-1.5 text-center">
        <img
          src="/class-a-logo.png"
          alt="Class A Jewellers"
          className="h-[28px] w-auto mx-auto object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
            const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "block";
          }}
        />
        <div className="font-serif text-[11px] font-bold text-white tracking-wider hidden">
          CLASS A JEWELLERS
        </div>
        <div className="text-[7px] text-white/70 mt-0.5">
          40 North East Road, Walkerville SA 5081
        </div>
      </div>

      {/* Ref + Due Date */}
      <div className="flex items-start justify-between px-2.5 pt-2 pb-1 gap-2 border-b border-gray-100">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[9px] font-bold text-black truncate">
            {data.packet_type
              ? (isOnline ? "ON-" : "CA-") + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-XXXX"
              : "—"}
          </div>
          {/* Simulated barcode */}
          <div className="flex items-end gap-px mt-1 h-5">
            {Array.from({ length: 28 }).map((_, i) => (
              <div
                key={i}
                className="bg-black"
                style={{
                  width: i % 3 === 0 ? 2 : 1,
                  height: i % 5 === 0 ? "100%" : "70%",
                }}
              />
            ))}
          </div>
        </div>
        <div className="bg-black rounded px-1.5 py-1 text-center flex-shrink-0">
          <div className="text-[6px] text-white uppercase tracking-wide font-semibold">Due Date</div>
          <div className="text-[9px] font-bold text-white mt-0.5">{dueDisplay}</div>
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-2 gap-0 px-2.5 py-1.5 border-b border-gray-100">
        <div className="pr-2 space-y-0.5 border-r border-gray-100">
          <Row label="Name" value={customerName} />
          <Row label="Address" value={addressLine} />
          <Row label="Phone" value={data.customer_phone || "—"} />
          <Row label="Email" value={data.customer_email || "—"} />
        </div>
        <div className="pl-2 space-y-0.5">
          <Row label="In Date" value={data.in_date ? formatDateAU(data.in_date) : "—"} />
          <Row label="Cust #" value={data.customer_number || "—"} />
          <Row label="Stock #" value={data.stock_number || "—"} />
          <Row label="Valuation" value={data.valuation_required ? "YES" : "NO"} />
          <Row label="Contact" value={contactPref} />
          {isOnline && (
            <>
              <Row label="Order #" value={data.order_number || "—"} />
              <Row label="Ship" value={data.shipping_method || "—"} />
            </>
          )}
        </div>
      </div>

      {/* Articles / Items */}
      <div className="px-2.5 py-1.5 border-b border-gray-100">
        <span className="text-[6.5px] font-semibold text-gray-500 uppercase">
          {isOnline ? "Items: " : "Articles: "}
        </span>
        <span className="text-[7.5px] text-black">
          {(isOnline ? data.items_ordered : data.articles) || "—"}
        </span>
      </div>

      {/* Instructions / Notes */}
      <div className="px-2.5 py-1.5 border-b border-gray-100 min-h-[28px]">
        <span className="text-[6.5px] font-semibold text-gray-500 uppercase">
          {isOnline ? "Notes: " : "Instructions: "}
        </span>
        <span className="text-[7px] text-black whitespace-pre-wrap">
          {(isOnline ? data.order_notes : data.instructions) || "—"}
        </span>
      </div>

      {/* Pricing */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <PriceCol label="Total" value={formatCurrency(parseCurrency(data.total_charges))} />
        <PriceCol label="Deposit" value={formatCurrency(parseCurrency(data.deposit))} />
        <PriceCol label="Balance" value={formatCurrency(balance)} />
      </div>

      {/* Bottom */}
      <div className="grid grid-cols-2 gap-0 px-2.5 py-1.5 border-b border-gray-100">
        <div className="pr-2 text-[6.5px] text-gray-600 space-y-0.5 border-r border-gray-100">
          <div>{data.referral_source || "—"} | {data.occasion || "—"} | {data.staff_member || "—"}</div>
        </div>
        <div className="pl-2 text-[6.5px] text-gray-600 space-y-0.5">
          <div>RT: —</div>
          <div>Collected: __ /__ /____</div>
          <div>Signed: _____________</div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="px-2.5 py-1.5 text-center text-[5.5px] text-red-600 font-semibold leading-tight">
        THIS STORE IS NOT RESPONSIBLE FOR ARTICLES LEFT OVER 30 DAYS.
        NO ARTICLE CAN BE PICKED UP WITHOUT THIS RECEIPT.
      </div>
    </div>

    {/* Print Label button */}
    <button
      type="button"
      onClick={handlePrintLabel}
      className="mt-3 w-full bg-black text-white text-xs font-semibold py-2.5 rounded-lg hover:bg-[#222222] active:scale-95 transition-all flex items-center justify-center gap-2"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
      </svg>
      Print Label
    </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <span className="text-[6px] text-gray-400 uppercase font-semibold flex-shrink-0 w-10 pt-px">
        {label}
      </span>
      <span className="text-[7px] text-black truncate">{value}</span>
    </div>
  );
}

function PriceCol({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-1 text-center">
      <div className="text-[5.5px] text-gray-400 uppercase">{label}</div>
      <div className="text-[8px] font-bold text-black">{value}</div>
    </div>
  );
}
