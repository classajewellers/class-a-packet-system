import { Quote, LineItem } from "@/lib/types";
import { BLACK_LOGO_DATA_URI } from "@/lib/logoDataURIs";
import { staffEmail } from "@/lib/staffEmails";

// ── helpers (mirrors quoteGenerator.ts) ──────────────────────────────────────

function formatDateAU(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const MIN_ROWS = 8;

// ── component ─────────────────────────────────────────────────────────────────

export default function QuoteDocument({ quote }: { quote: Quote }) {
  const customerName = [quote.customer_first_name, quote.customer_last_name]
    .filter(Boolean)
    .join(" ");

  const lineItems: LineItem[] = quote.line_items ?? [];
  const paddingStart = lineItems.length;
  const filledItems = [...lineItems];
  while (filledItems.length < MIN_ROWS) {
    filledItems.push({ design: "", stone: "", price: "", cost_price: "" });
  }

  const createdDate =
    formatDateAU(quote.created_at) || formatDateAU(new Date().toISOString());
  const staffName = quote.staff_member ?? "";
  const staffEmailAddr = staffEmail(quote.staff_member);

  return (
    <div
      style={{
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "10pt",
        color: "#000",
        background: "#fff",
        padding: "48px",
        minHeight: "1123px",
        boxSizing: "border-box",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "14px",
        }}
      >
        <img
          src={BLACK_LOGO_DATA_URI}
          alt="Vault"
          style={{ maxHeight: "60px", width: "auto", display: "block" }}
        />
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: "22pt",
              fontWeight: "bold",
              letterSpacing: "2px",
              color: "#000",
              lineHeight: 1,
              textTransform: "uppercase",
            }}
          >
            Quotation
          </div>
          <div
            style={{
              fontSize: "8pt",
              color: "#333",
              marginTop: "5px",
              lineHeight: 1.6,
            }}
          >
            40 North East Road, Walkerville SA 5081
            <br />
            08 8344 7722 &nbsp;|&nbsp; classa.com.au
          </div>
        </div>
      </div>

      {/* ── Top divider ── */}
      <hr
        style={{
          border: "none",
          borderTop: "1.5px solid #000",
          margin: "10px 0 16px 0",
        }}
      />

      {/* ── Reference row ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
        }}
      >
        <span style={{ fontSize: "8pt", color: "#555" }}>
          Reference:{" "}
          <span
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: "9pt",
              fontWeight: "bold",
              color: "#000",
            }}
          >
            {quote.reference_number}
          </span>
        </span>
      </div>

      {/* ── Customer / Date row ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: "20px",
          gap: "20px",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "8pt", color: "#555", marginBottom: "3px" }}>
            Customer Name
          </div>
          <div
            style={{
              fontSize: "11pt",
              fontWeight: 600,
              color: "#000",
              borderBottom: "1px solid #000",
              paddingBottom: "2px",
              minHeight: "20px",
            }}
          >
            {customerName || " "}
          </div>
        </div>
        <div style={{ flexShrink: 0, minWidth: "140px", textAlign: "right" }}>
          <div style={{ fontSize: "8pt", color: "#555", marginBottom: "3px" }}>
            Date
          </div>
          <div
            style={{
              fontSize: "11pt",
              fontWeight: 600,
              color: "#000",
              borderBottom: "1px solid #000",
              paddingBottom: "2px",
              minHeight: "20px",
            }}
          >
            {createdDate}
          </div>
        </div>
      </div>

      {/* ── Line items table ── */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          border: "1px solid #ccc",
          marginBottom: 0,
        }}
      >
        <thead>
          <tr style={{ background: "#000" }}>
            <th
              style={{
                padding: "8px 10px",
                textAlign: "center",
                fontSize: "8.5pt",
                fontWeight: "bold",
                color: "#fff",
                letterSpacing: "0.5px",
                width: "32px",
              }}
            >
              #
            </th>
            <th
              style={{
                padding: "8px 10px",
                textAlign: "left",
                fontSize: "8.5pt",
                fontWeight: "bold",
                color: "#fff",
                letterSpacing: "0.5px",
              }}
            >
              Design
            </th>
            <th
              style={{
                padding: "8px 10px",
                textAlign: "left",
                fontSize: "8.5pt",
                fontWeight: "bold",
                color: "#fff",
                letterSpacing: "0.5px",
                width: "160px",
              }}
            >
              Stone
            </th>
            <th
              style={{
                padding: "8px 10px",
                textAlign: "right",
                fontSize: "8.5pt",
                fontWeight: "bold",
                color: "#fff",
                letterSpacing: "0.5px",
                whiteSpace: "nowrap",
              }}
            >
              Price (incl. GST)
            </th>
          </tr>
        </thead>
        <tbody>
          {filledItems.map((li, i) => {
            const isPadding = i >= paddingStart;
            const bg = i % 2 === 0 ? "#ffffff" : "#f0f0f0";
            return (
              <tr key={i} style={{ background: bg }}>
                <td
                  style={{
                    padding: "6px 10px",
                    fontSize: "9pt",
                    color: "#333",
                    borderRight: "1px solid #ddd",
                    width: "32px",
                    textAlign: "center",
                  }}
                >
                  {isPadding ? "" : i + 1}
                </td>
                <td
                  style={{
                    padding: "6px 10px",
                    fontSize: "9pt",
                    color: "#333",
                    borderRight: "1px solid #ddd",
                  }}
                >
                  {isPadding ? " " : li.design}
                </td>
                <td
                  style={{
                    padding: "6px 10px",
                    fontSize: "9pt",
                    color: "#333",
                    borderRight: "1px solid #ddd",
                  }}
                >
                  {isPadding ? " " : li.stone}
                </td>
                <td
                  style={{
                    padding: "6px 10px",
                    fontSize: "9pt",
                    color: "#333",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    width: "110px",
                  }}
                >
                  {isPadding ? " " : li.price}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Table bottom divider ── */}
      <hr
        style={{ border: "none", borderTop: "1.5px solid #000", margin: 0 }}
      />

      {/* ── Footer ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "24px",
          marginTop: "10px",
          paddingTop: "12px",
          borderTop: "1px solid #ccc",
        }}
      >
        <div
          style={{
            flex: 1,
            fontSize: "8pt",
            color: "#777",
            fontStyle: "italic",
            lineHeight: 1.7,
          }}
        >
          Valid for 7 business days from the date of this quotation, subject to
          availability.
          <br />
          A 20% deposit is required to commence work.
        </div>
        <div
          style={{
            flexShrink: 0,
            textAlign: "right",
            fontSize: "9pt",
            lineHeight: 1.7,
          }}
        >
          {staffName && (
            <div style={{ fontWeight: "bold", color: "#000" }}>{staffName}</div>
          )}
          <div style={{ color: "#333" }}>{staffEmailAddr}</div>
          <div style={{ color: "#333" }}>08 8344 7722</div>
        </div>
      </div>
    </div>
  );
}
