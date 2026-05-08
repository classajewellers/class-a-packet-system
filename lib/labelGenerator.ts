import { Packet } from "./types";
import { formatDateAU, formatCurrency } from "./formatters";

// ─── Dymo Label XML ───────────────────────────────────────────────────────────
// Target: LabelWriter 5XL — 104mm × 159mm label stock

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generateDymoXML(packet: Packet): string {
  const customerName = [packet.customer_first_name, packet.customer_last_name]
    .filter(Boolean)
    .join(" ");

  const addressLine = [
    packet.customer_street,
    packet.customer_suburb,
    packet.customer_state,
    packet.customer_postcode,
  ]
    .filter(Boolean)
    .join(", ");

  const contactPref = (packet.contact_preference ?? []).join(", ");
  const isOnline = packet.packet_type === "online_order";
  const deliveryDisplay = isOnline
    ? (packet.shipping_method || "Pickup")
    : ((packet as {delivery_method?: string | null}).delivery_method || "Pickup");
  const giftWrap = (packet as {gift_wrapping?: boolean | null}).gift_wrapping ? "YES" : "NO";

  return `<?xml version="1.0" encoding="utf-8"?>
<DimoLabel Version="2">
  <Record>
    <Variable Name="StoreName">${esc("CLASS A JEWELLERS")}</Variable>
    <Variable Name="StoreAddress">${esc("40 North East Road, Walkerville SA 5081")}</Variable>
    <Variable Name="PacketTypeDisplay">${isOnline ? esc("ONLINE ORDER") : ""}</Variable>
    <Variable Name="RefNumber">${esc(packet.reference_number)}</Variable>
    <Variable Name="DueDate">DUE: ${esc(formatDateAU(packet.due_date))}</Variable>
    <Variable Name="CustomerName">${esc(customerName)}</Variable>
    <Variable Name="Address">${esc(addressLine)}</Variable>
    <Variable Name="Phone">${esc(packet.customer_phone)}</Variable>
    <Variable Name="Email">${esc(packet.customer_email)}</Variable>
    <Variable Name="InDate">In: ${esc(formatDateAU(packet.in_date))}</Variable>
    <Variable Name="CustomerNo">Cust#: ${esc(packet.customer_number)}</Variable>
    <Variable Name="StockNo">Stock#: ${esc(packet.stock_number)}</Variable>
    <Variable Name="Valuation">Valuation Req: ${packet.valuation_required ? "YES" : "NO"}</Variable>
    <Variable Name="Contact">Contact: ${esc(contactPref)}</Variable>
    <Variable Name="GiftWrap">Gift Wrap: ${giftWrap}</Variable>
    <Variable Name="Delivery">Delivery: ${esc(deliveryDisplay)}</Variable>
    <Variable Name="Articles">${esc(packet.articles ?? packet.items_ordered)}</Variable>
    <Variable Name="Instructions">${esc(packet.instructions ?? packet.order_notes)}</Variable>
    <Variable Name="TotalCharges">Total: ${esc(formatCurrency(packet.total_charges))}</Variable>
    <Variable Name="Deposit">Dep: ${esc(formatCurrency(packet.deposit))}</Variable>
    <Variable Name="Balance">Bal: ${esc(formatCurrency(packet.balance))}</Variable>
    <Variable Name="Staff">Staff: ${esc(packet.staff_member)}</Variable>
    <Variable Name="OrderNumber">${isOnline ? esc(`Order#: ${packet.order_number ?? ""}`) : ""}</Variable>
    <Variable Name="RepairTracker">${esc(packet.repair_tracker_number)}</Variable>
    <Variable Name="Disclaimer">THIS STORE IS NOT RESPONSIBLE FOR ARTICLES LEFT OVER 30 DAYS. NO ARTICLE CAN BE PICKED UP WITHOUT THIS RECEIPT.</Variable>
  </Record>
  <Layout>
    <PaperName>30323 Shipping</PaperName>
    <DataFields>

      <!-- Online Order Banner -->
      <TextObject>
        <Name>PacketTypeDisplay</Name>
        <ForeColor Alpha="255" Red="255" Green="255" Blue="255" />
        <BackColor Alpha="255" Red="0" Green="0" Blue="0" />
        <LinkedObjectName>PacketTypeDisplay</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Middle</VerticalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^PacketTypeDisplay</String>
            <Attributes>
              <Font Family="Arial" Size="18" Bold="True" Italic="False" Underline="False" StrikeOut="False" />
              <ForeColor Alpha="255" Red="255" Green="255" Blue="255" />
            </Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="57" Width="3980" Height="280" />
      </TextObject>

      <!-- Store Name (bold serif, B&W) -->
      <TextObject>
        <Name>StoreName</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName>StoreName</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^StoreName</String>
            <Attributes>
              <Font Family="Georgia" Size="16" Bold="True" Italic="False" Underline="False" StrikeOut="False" />
            </Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="360" Width="3980" Height="300" />
      </TextObject>

      <!-- Customer Name — largest element -->
      <TextObject>
        <Name>CustomerName</Name>
        <LinkedObjectName>CustomerName</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^CustomerName</String>
            <Attributes>
              <Font Family="Arial" Size="20" Bold="True" Italic="False" Underline="False" StrikeOut="False" />
            </Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="700" Width="3980" Height="320" />
      </TextObject>

      <!-- Reference Number -->
      <TextObject>
        <Name>RefNumber</Name>
        <LinkedObjectName>RefNumber</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^RefNumber</String>
            <Attributes>
              <Font Family="Arial" Size="14" Bold="True" Italic="False" Underline="False" StrikeOut="False" />
            </Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="1060" Width="2400" Height="220" />
      </TextObject>

      <!-- Barcode -->
      <BarcodeObject>
        <Name>Barcode</Name>
        <LinkedObjectName>RefNumber</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <BarcodeFormat>Code128Auto</BarcodeFormat>
        <EANSymbol>False</EANSymbol>
        <BarcodeWidth>Regular</BarcodeWidth>
        <ShowTextBelow>True</ShowTextBelow>
        <Bounds X="57" Y="1300" Width="2400" Height="480" />
      </BarcodeObject>

      <!-- Due Date Box (black) -->
      <TextObject>
        <Name>DueDate</Name>
        <ForeColor Alpha="255" Red="255" Green="255" Blue="255" />
        <BackColor Alpha="255" Red="0" Green="0" Blue="0" />
        <LinkedObjectName>DueDate</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Middle</VerticalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^DueDate</String>
            <Attributes>
              <Font Family="Arial" Size="14" Bold="True" Italic="False" Underline="False" StrikeOut="False" />
              <ForeColor Alpha="255" Red="255" Green="255" Blue="255" />
            </Attributes>
          </Element>
        </StyledText>
        <Bounds X="2514" Y="1060" Width="1523" Height="720" />
      </TextObject>

      <!-- Address / Phone / Email -->
      <TextObject>
        <Name>Address</Name>
        <LinkedObjectName>Address</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^Address</String>
            <Attributes><Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="1840" Width="1980" Height="150" />
      </TextObject>
      <TextObject>
        <Name>Phone</Name>
        <LinkedObjectName>Phone</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^Phone</String>
            <Attributes><Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="2000" Width="1980" Height="150" />
      </TextObject>
      <TextObject>
        <Name>Email</Name>
        <LinkedObjectName>Email</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^Email</String>
            <Attributes><Font Family="Arial" Size="7" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="2160" Width="1980" Height="150" />
      </TextObject>

      <!-- Right column -->
      <TextObject>
        <Name>InDate</Name>
        <LinkedObjectName>InDate</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^InDate</String>
            <Attributes><Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="2094" Y="1840" Width="1943" Height="150" />
      </TextObject>
      <TextObject>
        <Name>GiftWrap</Name>
        <LinkedObjectName>GiftWrap</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^GiftWrap</String>
            <Attributes><Font Family="Arial" Size="8" Bold="True" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="2094" Y="2000" Width="1943" Height="150" />
      </TextObject>
      <TextObject>
        <Name>Delivery</Name>
        <LinkedObjectName>Delivery</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^Delivery</String>
            <Attributes><Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="2094" Y="2160" Width="1943" Height="150" />
      </TextObject>

      <!-- Instructions -->
      <TextObject>
        <Name>Instructions</Name>
        <LinkedObjectName>Instructions</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^Instructions</String>
            <Attributes><Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="2360" Width="3980" Height="300" />
      </TextObject>

      <!-- Articles -->
      <TextObject>
        <Name>Articles</Name>
        <LinkedObjectName>Articles</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^Articles</String>
            <Attributes><Font Family="Arial" Size="9" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="2700" Width="3980" Height="260" />
      </TextObject>

      <!-- Pricing row -->
      <TextObject>
        <Name>TotalCharges</Name>
        <LinkedObjectName>TotalCharges</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^TotalCharges</String>
            <Attributes><Font Family="Arial" Size="9" Bold="True" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="3010" Width="1290" Height="180" />
      </TextObject>
      <TextObject>
        <Name>Deposit</Name>
        <LinkedObjectName>Deposit</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^Deposit</String>
            <Attributes><Font Family="Arial" Size="9" Bold="True" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="1400" Y="3010" Width="1290" Height="180" />
      </TextObject>
      <TextObject>
        <Name>Balance</Name>
        <LinkedObjectName>Balance</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^Balance</String>
            <Attributes><Font Family="Arial" Size="9" Bold="True" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="2750" Y="3010" Width="1287" Height="180" />
      </TextObject>

      <!-- Staff + order info -->
      <TextObject>
        <Name>StaffInfo</Name>
        <LinkedObjectName>Staff</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^Staff | ^OrderNumber | RT: ^RepairTracker</String>
            <Attributes><Font Family="Arial" Size="7" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="3240" Width="3980" Height="160" />
      </TextObject>

      <!-- Disclaimer (black, not red) -->
      <TextObject>
        <Name>Disclaimer</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <LinkedObjectName>Disclaimer</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^Disclaimer</String>
            <Attributes>
              <Font Family="Arial" Size="6" Bold="False" Italic="False" Underline="False" StrikeOut="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="3460" Width="3980" Height="200" />
      </TextObject>

    </DataFields>
    <Bounds X="0" Y="0" Width="4094" Height="6260" />
  </Layout>
</DimoLabel>`;
}

// ─── HTML label fallback (A6 print) — B&W only ───────────────────────────────
export function generatePrintHTML(packet: Packet): string {
  const customerName = [packet.customer_first_name, packet.customer_last_name]
    .filter(Boolean)
    .join(" ");
  const addressLine = [
    packet.customer_street,
    packet.customer_suburb,
    packet.customer_state,
    packet.customer_postcode,
  ]
    .filter(Boolean)
    .join(", ");

  const isOnline = packet.packet_type === "online_order";
  const giftWrap = (packet as {gift_wrapping?: boolean | null}).gift_wrapping ? "YES" : "NO";
  const deliveryDisplay = isOnline
    ? (packet.shipping_method || "Pickup")
    : ((packet as {delivery_method?: string | null}).delivery_method || "Pickup");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Class A Jewellers — ${esc(packet.reference_number)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: 105mm 148mm portrait; margin: 4mm; }
  body {
    width: 97mm;
    font-family: Arial, sans-serif;
    font-size: 8pt;
    line-height: 1.3;
    color: #000;
    background: #fff;
  }

  /* Online order banner — black only */
  .online-banner {
    background: #000;
    color: #fff;
    font-size: 13pt;
    font-weight: bold;
    text-align: center;
    padding: 2mm;
    margin-bottom: 2mm;
    letter-spacing: 2px;
  }

  /* Store name — bold serif, no background */
  .store-name {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 12pt;
    font-weight: bold;
    text-align: center;
    border-bottom: 1.5pt solid #000;
    padding-bottom: 1.5mm;
    margin-bottom: 2mm;
  }
  .store-addr {
    font-size: 6pt;
    color: #555;
    text-align: center;
    margin-top: 1mm;
  }

  /* Customer name — LARGEST element */
  .customer-name {
    font-size: 16pt;
    font-weight: bold;
    margin: 2mm 0 1.5mm 0;
    line-height: 1.1;
  }

  /* Reference + due date row */
  .ref-due-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2mm;
    gap: 2mm;
  }
  .ref-block { flex: 1; }
  .ref-num {
    font-size: 12pt;
    font-weight: bold;
    font-family: 'Courier New', monospace;
  }
  .barcode-placeholder {
    font-family: monospace;
    font-size: 6pt;
    color: #888;
    letter-spacing: 3px;
    margin-top: 0.5mm;
  }
  .due-box {
    background: #000;
    color: #fff;
    font-size: 10pt;
    font-weight: bold;
    padding: 1.5mm 2.5mm;
    text-align: center;
    line-height: 1.2;
    min-width: 22mm;
  }
  .due-label { font-size: 5.5pt; display: block; font-weight: normal; letter-spacing: 1px; }

  /* Grid for details */
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8mm 2mm; margin-bottom: 2mm; }
  .field { font-size: 7.5pt; }
  .field-label { font-weight: 700; font-size: 6pt; color: #555; text-transform: uppercase; letter-spacing: 0.3px; }
  .full-width { grid-column: 1 / -1; }
  .articles-text { font-size: 8pt; font-weight: 600; white-space: pre-wrap; }
  .instructions-text { font-size: 7pt; color: #222; white-space: pre-wrap; }

  /* Separator */
  .sep { border: none; border-top: 0.5pt solid #999; margin: 1.5mm 0; }

  /* Pricing */
  .pricing {
    display: flex;
    justify-content: space-between;
    border-top: 1pt solid #000;
    border-bottom: 1pt solid #000;
    padding: 1mm 0;
    margin: 1.5mm 0;
  }
  .price-item { text-align: center; flex: 1; }
  .price-label { font-size: 5.5pt; color: #555; text-transform: uppercase; }
  .price-val { font-size: 9pt; font-weight: bold; }

  /* Staff / bottom */
  .bottom { font-size: 7pt; color: #333; margin-top: 1mm; }
  .collected-row { margin-top: 1mm; }

  /* Disclaimer — black */
  .disclaimer {
    margin-top: 2mm;
    font-size: 5.5pt;
    color: #000;
    text-align: center;
    font-weight: bold;
    border-top: 0.5pt solid #000;
    padding-top: 1mm;
  }
</style>
</head>
<body>
  ${isOnline ? '<div class="online-banner">★ ONLINE ORDER ★</div>' : ""}

  <div class="store-name">CLASS A JEWELLERS</div>
  <div class="store-addr">40 North East Road, Walkerville SA 5081 &bull; (08) 8344 7722</div>

  <!-- 1. Customer name — largest and first -->
  <div class="customer-name">${esc(customerName) || "&nbsp;"}</div>

  <!-- 2. Reference + due date -->
  <div class="ref-due-row">
    <div class="ref-block">
      <div class="ref-num">${esc(packet.reference_number)}</div>
      <div class="barcode-placeholder">||||| ${esc(packet.reference_number)} |||||</div>
    </div>
    <div class="due-box">
      <span class="due-label">DUE DATE</span>
      ${esc(formatDateAU(packet.due_date)) || "—"}
    </div>
  </div>

  <!-- 3. Address / phone / email -->
  <div class="grid">
    ${addressLine ? `<div class="field full-width"><div class="field-label">Address</div>${esc(addressLine)}</div>` : ""}
    ${packet.customer_phone ? `<div class="field"><div class="field-label">Phone</div>${esc(packet.customer_phone)}</div>` : ""}
    ${packet.customer_email ? `<div class="field"><div class="field-label">Email</div><span style="font-size:6.5pt">${esc(packet.customer_email)}</span></div>` : ""}
  </div>

  <hr class="sep">

  <!-- 4. Order notes / instructions -->
  ${(isOnline ? packet.order_notes : packet.instructions) ? `
  <div class="field full-width" style="margin-bottom:1.5mm;">
    <div class="field-label">${isOnline ? "Order Notes" : "Instructions"}</div>
    <div class="instructions-text">${esc(isOnline ? packet.order_notes : packet.instructions)}</div>
  </div>` : ""}

  <!-- 5. Gift wrapping + delivery method -->
  <div class="grid" style="margin-bottom:1.5mm;">
    <div class="field"><div class="field-label">Gift Wrapping</div><strong>${giftWrap}</strong></div>
    <div class="field"><div class="field-label">${isOnline ? "Shipping" : "Delivery"}</div>${esc(deliveryDisplay)}</div>
    ${isOnline && packet.order_number ? `<div class="field"><div class="field-label">Order #</div>${esc(packet.order_number)}</div>` : ""}
    ${packet.customer_number ? `<div class="field"><div class="field-label">Cust #</div>${esc(packet.customer_number)}</div>` : ""}
  </div>

  <hr class="sep">

  <!-- 6. Articles -->
  ${(isOnline ? packet.items_ordered : packet.articles) ? `
  <div style="margin-bottom:1.5mm;">
    <div class="field-label">${isOnline ? "Items Ordered" : "Articles"}</div>
    <div class="articles-text">${esc(isOnline ? packet.items_ordered : packet.articles)}</div>
  </div>` : ""}

  <!-- 7. Pricing -->
  <div class="pricing">
    <div class="price-item">
      <div class="price-label">Total</div>
      <div class="price-val">${formatCurrency(packet.total_charges)}</div>
    </div>
    <div class="price-item">
      <div class="price-label">Deposit</div>
      <div class="price-val">${formatCurrency(packet.deposit)}</div>
    </div>
    <div class="price-item">
      <div class="price-label">Balance</div>
      <div class="price-val">${formatCurrency(packet.balance)}</div>
    </div>
  </div>

  <!-- 8. Staff -->
  <div class="bottom">
    <strong>Staff:</strong> ${esc(packet.staff_member ?? "—")}
    ${packet.repair_tracker_number ? ` &bull; RT: ${esc(packet.repair_tracker_number)}` : ""}
    <div class="collected-row">Collected: ___/___/___&nbsp;&nbsp;&nbsp;Signed: ____________________</div>
  </div>

  <!-- 9. Disclaimer -->
  <div class="disclaimer">
    THIS STORE IS NOT RESPONSIBLE FOR ARTICLES LEFT OVER 30 DAYS.
    NO ARTICLE CAN BE PICKED UP WITHOUT THIS RECEIPT.
  </div>
</body>
</html>`;
}
