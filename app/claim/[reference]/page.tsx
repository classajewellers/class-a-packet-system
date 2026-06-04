import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Packet } from "@/lib/types";
import { formatDateAU, formatCurrency } from "@/lib/formatters";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

/* ── helpers ────────────────────────────────────────────────────────────── */

function resolveDelivery(packet: Packet): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pd: any = {};
  try {
    pd =
      typeof packet.packet_data === "string"
        ? JSON.parse(packet.packet_data as string)
        : (packet.packet_data ?? {});
  } catch {
    pd = {};
  }
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (packet as any).delivery_method ||
    packet.shipping_method ||
    pd?.shipping_method ||
    pd?.shippingMethod ||
    pd?.shipping_lines?.[0]?.title ||
    pd?.shippingLines?.[0]?.title ||
    "Pickup"
  );
}

/* ── page ───────────────────────────────────────────────────────────────── */

export default async function ClaimSlipPage({
  params,
}: {
  params: { reference: string };
}) {
  const supabase = createServerSupabaseClient();

  // Decode in case the reference was URL-encoded (e.g. spaces → %20)
  const ref = decodeURIComponent(params.reference);

  const { data: raw, error } = await supabase
    .from("packets")
    .select("*")
    .eq("reference_number", ref)
    .maybeSingle();

  if (error) {
    // Surface real DB errors as 500 rather than masking them as 404
    console.error("[claim-slip] Supabase query error:", error);
    throw new Error(`Failed to load claim slip: ${error.message}`);
  }
  if (!raw) notFound();

  const packet = raw as Packet;

  /* ── computed values ── */
  const customerName =
    [packet.customer_first_name, packet.customer_last_name]
      .filter(Boolean)
      .join(" ") || "Customer";

  const dueDate = packet.due_date ? formatDateAU(packet.due_date) : "—";
  const totalCharges = formatCurrency(packet.total_charges);
  const depositPaid = formatCurrency(packet.deposit);
  const balanceOwing = formatCurrency(
    Math.max(0, (packet.total_charges ?? 0) - (packet.deposit ?? 0))
  );

  const giftWrap =
    packet.gift_wrapping === true ||
    (packet.gift_wrapping as unknown) === "true"
      ? "YES"
      : "NO";

  const delivery = resolveDelivery(packet);

  const address = [
    packet.customer_street,
    packet.customer_suburb,
    packet.customer_state,
    packet.customer_postcode,
  ]
    .filter(Boolean)
    .join(", ");

  const issuedDate = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let articlesBlock = "";
  if (packet.articles && packet.instructions) {
    articlesBlock = `${packet.articles}\n\nInstructions: ${packet.instructions}`;
  } else {
    articlesBlock = packet.articles || packet.instructions || "—";
  }

  /* ── render ── */
  return (
    <>
      {/* ── global styles (screen + print) ── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          background: #F5F5F5;
          color: #111;
          -webkit-font-smoothing: antialiased;
        }

        .claim-page {
          min-height: 100vh;
          background: #F5F5F5;
          padding: 32px 16px 48px;
        }

        .print-btn-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 24px;
        }

        .slip {
          background: #fff;
          max-width: 540px;
          margin: 0 auto;
          padding: 32px 28px;
          border-radius: 4px;
          box-shadow: 0 2px 16px rgba(0,0,0,0.10);
          font-size: 13px;
          line-height: 1.5;
        }

        /* ── Header ── */
        .slip-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 14px;
          border-bottom: 2.5px solid #222;
          margin-bottom: 16px;
        }
        .store-name {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          line-height: 1.1;
          color: #635BFF;
        }
        .store-tagline {
          font-size: 10px;
          color: #666;
          margin-top: 4px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .store-details {
          font-size: 10px;
          color: #555;
          line-height: 1.7;
          text-align: right;
        }

        /* ── CLAIM SLIP heading ── */
        .claim-heading {
          text-align: center;
          margin: 10px 0 8px;
        }
        .claim-heading-text {
          display: inline-block;
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          border: 3px solid #222;
          padding: 5px 20px;
        }

        /* ── Reference + name ── */
        .ref-number {
          text-align: center;
          font-family: 'Courier New', Courier, monospace;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 0.12em;
          margin: 8px 0 4px;
        }
        .customer-name {
          text-align: center;
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .issued-date {
          text-align: center;
          font-size: 11px;
          color: #666;
          margin-bottom: 12px;
        }

        /* ── Due date box ── */
        .due-date-box {
          background: #222;
          color: #fff;
          text-align: center;
          padding: 10px 12px;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 16px;
          border-radius: 2px;
        }

        /* ── Sections ── */
        .section {
          margin-bottom: 14px;
        }
        .section-title {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          border-bottom: 1.5px solid #222;
          padding-bottom: 3px;
          margin-bottom: 6px;
          color: #333;
        }
        .section-content {
          font-size: 13px;
          line-height: 1.6;
        }

        /* ── Articles box ── */
        .articles-box {
          border: 1.5px solid #222;
          padding: 8px 10px;
          font-size: 12px;
          line-height: 1.65;
          white-space: pre-wrap;
          min-height: 60px;
          border-radius: 2px;
        }

        /* ── Meta row ── */
        .meta-row {
          display: flex;
          border: 1.5px solid #222;
          margin-bottom: 14px;
          border-radius: 2px;
        }
        .meta-cell {
          flex: 1;
          padding: 7px 10px;
          border-right: 1.5px solid #222;
        }
        .meta-cell:last-child { border-right: none; }
        .meta-label {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          margin-bottom: 3px;
          color: #555;
        }
        .meta-value {
          font-size: 13px;
          font-weight: 700;
        }

        /* ── Pricing table ── */
        .price-table {
          width: 100%;
          border-collapse: collapse;
          border: 1.5px solid #222;
          border-radius: 2px;
          overflow: hidden;
        }
        .price-table td {
          padding: 7px 12px;
          font-size: 13px;
          border-bottom: 1px solid #ddd;
        }
        .price-table tr:last-child td {
          font-weight: 700;
          font-size: 14px;
          border-top: 2px solid #222;
          border-bottom: none;
          background: #F5F5F5;
        }
        .price-table td:last-child {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        /* ── Disclaimer ── */
        .disclaimer {
          border: 2.5px solid #222;
          padding: 10px 14px;
          font-size: 11px;
          font-weight: 700;
          text-align: center;
          line-height: 1.7;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin: 16px 0 14px;
          border-radius: 2px;
        }

        /* ── Signature ── */
        .signature-line {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .signature-blank {
          flex: 1;
          border-bottom: 1.5px solid #222;
          height: 24px;
        }

        /* ── Footer ── */
        .slip-footer {
          border-top: 1.5px solid #222;
          padding-top: 8px;
          font-size: 10px;
          text-align: center;
          color: #666;
          line-height: 1.6;
        }

        /* ── Print styles ── */
        @media print {
          body { background: #fff !important; }
          .claim-page { padding: 0 !important; background: #fff !important; }
          .print-btn-wrap { display: none !important; }
          .slip {
            box-shadow: none !important;
            max-width: none !important;
            padding: 10mm 12mm !important;
            border-radius: 0 !important;
            margin: 0 !important;
          }
          @page {
            size: A5 portrait;
            margin: 8mm 10mm;
          }
        }
      `}</style>

      <div className="claim-page">
        {/* ── Print button ── */}
        <div className="print-btn-wrap">
          <PrintButton />
        </div>

        {/* ── Claim slip document ── */}
        <div className="slip">

          {/* Header */}
          <div className="slip-header">
            <div>
              <div className="store-name">Class A<br />Jewellers</div>
              <div className="store-tagline">Expert Jewellery Services</div>
            </div>
            <div className="store-details">
              40 North East Road<br />
              Walkerville SA 5081<br />
              +61 8 8344 7722<br />
              customercare@classa.com.au
            </div>
          </div>

          {/* CLAIM SLIP heading */}
          <div className="claim-heading">
            <span className="claim-heading-text">Claim Slip</span>
          </div>

          {/* Ref + customer */}
          <div className="ref-number">{packet.reference_number}</div>
          <div className="customer-name">{customerName}</div>
          <div className="issued-date">Issued: {issuedDate}</div>

          {/* Due date */}
          <div className="due-date-box">Collect By: {dueDate}</div>

          {/* Customer details */}
          <div className="section">
            <div className="section-title">Customer Details</div>
            <div className="section-content">
              {packet.customer_phone && (
                <div><strong>Phone:</strong> {packet.customer_phone}</div>
              )}
              {packet.customer_email && (
                <div><strong>Email:</strong> {packet.customer_email}</div>
              )}
              {address && (
                <div><strong>Address:</strong> {address}</div>
              )}
            </div>
          </div>

          {/* Articles & Instructions */}
          <div className="section">
            <div className="section-title">Articles &amp; Instructions</div>
            <div className="articles-box">{articlesBlock}</div>
          </div>

          {/* Meta: gift wrap / delivery / staff */}
          <div className="meta-row">
            <div className="meta-cell">
              <div className="meta-label">Gift Wrapping</div>
              <div className="meta-value">{giftWrap}</div>
            </div>
            <div className="meta-cell">
              <div className="meta-label">Delivery</div>
              <div className="meta-value">{delivery}</div>
            </div>
            <div className="meta-cell">
              <div className="meta-label">Taken By</div>
              <div className="meta-value">{packet.staff_member ?? "—"}</div>
            </div>
          </div>

          {/* Pricing */}
          <div className="section">
            <div className="section-title">Pricing</div>
            <table className="price-table">
              <tbody>
                <tr>
                  <td>Total Charges</td>
                  <td>{totalCharges}</td>
                </tr>
                <tr>
                  <td>Deposit Paid</td>
                  <td>{depositPaid}</td>
                </tr>
                <tr>
                  <td>Balance Owing</td>
                  <td>{balanceOwing}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Disclaimer */}
          <div className="disclaimer">
            This claim slip is required for collection.<br />
            This store is not responsible for articles left over 30 days.<br />
            No article can be picked up without this slip.
          </div>

          {/* Signature */}
          <div className="signature-line">
            <span>Customer signature:</span>
            <div className="signature-blank" />
          </div>

          {/* Footer */}
          <div className="slip-footer">
            Class A Jewellers &nbsp;|&nbsp; 40 North East Road Walkerville SA 5081 &nbsp;|&nbsp; +61 8 8344 7722
          </div>

        </div>
      </div>
    </>
  );
}
