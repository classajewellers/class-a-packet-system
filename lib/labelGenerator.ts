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
    <Variable Name="Articles">${esc(packet.articles ?? packet.items_ordered)}</Variable>
    <Variable Name="Instructions">${esc(packet.instructions ?? packet.order_notes)}</Variable>
    <Variable Name="TotalCharges">Total: ${esc(formatCurrency(packet.total_charges))}</Variable>
    <Variable Name="Deposit">Dep: ${esc(formatCurrency(packet.deposit))}</Variable>
    <Variable Name="Balance">Bal: ${esc(formatCurrency(packet.balance))}</Variable>
    <Variable Name="Referral">${esc(packet.referral_source)}</Variable>
    <Variable Name="Occasion">${esc(packet.occasion)}</Variable>
    <Variable Name="Staff">${esc(packet.staff_member)}</Variable>
    <Variable Name="OrderNumber">${isOnline ? esc(`Order#: ${packet.order_number ?? ""}`) : ""}</Variable>
    <Variable Name="ShippingMethod">${isOnline ? esc(`Ship: ${packet.shipping_method ?? ""}`) : ""}</Variable>
    <Variable Name="RepairTracker">${esc(packet.repair_tracker_number)}</Variable>
    <Variable Name="Disclaimer">THIS STORE IS NOT RESPONSIBLE FOR ARTICLES LEFT OVER 30 DAYS. NO ARTICLE CAN BE PICKED UP WITHOUT THIS RECEIPT.</Variable>
  </Record>
  <Layout>
    <PaperName>30323 Shipping</PaperName>
    <DataFields>

      <!-- Online Order Banner (hidden for non-online packets) -->
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

      <!-- Store Name -->
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

      <!-- Store Address -->
      <TextObject>
        <Name>StoreAddress</Name>
        <LinkedObjectName>StoreAddress</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^StoreAddress</String>
            <Attributes>
              <Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" StrikeOut="False" />
            </Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="660" Width="3980" Height="160" />
      </TextObject>

      <!-- Reference Number -->
      <TextObject>
        <Name>RefNumber</Name>
        <LinkedObjectName>RefNumber</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
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
        <Bounds X="57" Y="840" Width="2400" Height="240" />
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
        <Bounds X="57" Y="1090" Width="2400" Height="480" />
      </BarcodeObject>

      <!-- Due Date Box -->
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
        <Bounds X="2514" Y="840" Width="1523" Height="730" />
      </TextObject>

      <!-- Left column: Customer details -->
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
              <Font Family="Arial" Size="10" Bold="True" Italic="False" Underline="False" StrikeOut="False" />
            </Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="1630" Width="1980" Height="180" />
      </TextObject>
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
        <Bounds X="57" Y="1820" Width="1980" Height="150" />
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
        <Bounds X="57" Y="1980" Width="1980" Height="150" />
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
        <Bounds X="57" Y="2140" Width="1980" Height="150" />
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
        <Bounds X="2094" Y="1630" Width="1943" Height="150" />
      </TextObject>
      <TextObject>
        <Name>CustomerNo</Name>
        <LinkedObjectName>CustomerNo</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^CustomerNo</String>
            <Attributes><Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="2094" Y="1790" Width="1943" Height="150" />
      </TextObject>
      <TextObject>
        <Name>StockNo</Name>
        <LinkedObjectName>StockNo</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^StockNo</String>
            <Attributes><Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="2094" Y="1950" Width="1943" Height="150" />
      </TextObject>
      <TextObject>
        <Name>Valuation</Name>
        <LinkedObjectName>Valuation</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^Valuation</String>
            <Attributes><Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="2094" Y="2110" Width="1943" Height="150" />
      </TextObject>
      <TextObject>
        <Name>Contact</Name>
        <LinkedObjectName>Contact</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^Contact</String>
            <Attributes><Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="2094" Y="2270" Width="1943" Height="150" />
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
        <Bounds X="57" Y="2480" Width="3980" Height="260" />
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
        <Bounds X="57" Y="2760" Width="3980" Height="380" />
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
        <Bounds X="57" Y="3200" Width="1290" Height="180" />
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
        <Bounds X="1400" Y="3200" Width="1290" Height="180" />
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
        <Bounds X="2750" Y="3200" Width="1287" Height="180" />
      </TextObject>

      <!-- Bottom left -->
      <TextObject>
        <Name>StaffEtc</Name>
        <LinkedObjectName>Referral</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>^Referral | Occ: ^Occasion | Staff: ^Staff | ^OrderNumber ^ShippingMethod</String>
            <Attributes><Font Family="Arial" Size="7" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="3440" Width="1980" Height="180" />
      </TextObject>

      <!-- Bottom right -->
      <TextObject>
        <Name>RepairInfo</Name>
        <LinkedObjectName>RepairTracker</LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsVariable>True</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <TextFitMode>ShrinkToFit</TextFitMode>
        <StyledText>
          <Element>
            <String>RT: ^RepairTracker | Collected: ___/___/___ | Signed: ___________</String>
            <Attributes><Font Family="Arial" Size="7" Bold="False" Italic="False" Underline="False" StrikeOut="False" /></Attributes>
          </Element>
        </StyledText>
        <Bounds X="2057" Y="3440" Width="1980" Height="180" />
      </TextObject>

      <!-- Disclaimer -->
      <TextObject>
        <Name>Disclaimer</Name>
        <ForeColor Alpha="255" Red="204" Green="0" Blue="0" />
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
              <ForeColor Alpha="255" Red="204" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <Bounds X="57" Y="3680" Width="3980" Height="200" />
      </TextObject>

    </DataFields>
    <Bounds X="0" Y="0" Width="4094" Height="6260" />
  </Layout>
</DimoLabel>`;
}

// ─── HTML label fallback (A6 print) ──────────────────────────────────────────
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
  const contactPref = (packet.contact_preference ?? []).join(", ");
  const isOnline = packet.packet_type === "online_order";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Class A Jewellers — ${packet.reference_number}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: 104mm 159mm portrait; margin: 4mm; }
  body {
    width: 96mm;
    font-family: Arial, sans-serif;
    font-size: 8pt;
    line-height: 1.3;
    color: #000000;
  }
  .online-banner {
    background: #000000;
    color: #ffffff;
    font-size: 14pt;
    font-weight: bold;
    text-align: center;
    padding: 2mm;
    margin-bottom: 2mm;
    letter-spacing: 2px;
  }
  .header { text-align: center; border-bottom: 1.5pt solid #000000; padding-bottom: 2mm; margin-bottom: 2mm; }
  .store-name { font-family: Georgia, serif; font-size: 14pt; font-weight: bold; color: #000000; }
  .store-addr { font-size: 6.5pt; color: #555; }
  .ref-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2mm; }
  .ref-num { font-size: 12pt; font-weight: bold; }
  .due-box {
    background: #000000;
    border: 1pt solid #000000;
    color: #ffffff;
    font-size: 11pt;
    font-weight: bold;
    padding: 1mm 2mm;
    text-align: center;
    line-height: 1.2;
  }
  .due-label { font-size: 6pt; display: block; }
  .barcode-placeholder {
    font-family: monospace;
    font-size: 7pt;
    color: #888;
    letter-spacing: 2px;
    margin-bottom: 2mm;
  }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm; margin-bottom: 2mm; }
  .field { font-size: 7.5pt; }
  .field-label { font-weight: bold; font-size: 6.5pt; color: #666; text-transform: uppercase; }
  .full-width { grid-column: 1 / -1; }
  .articles { font-size: 8pt; font-weight: bold; }
  .instructions { font-size: 7pt; color: #333; white-space: pre-wrap; }
  .pricing { display: flex; justify-content: space-between; border-top: 1pt solid #ccc; border-bottom: 1pt solid #ccc; padding: 1mm 0; margin: 2mm 0; }
  .price-item { text-align: center; }
  .price-label { font-size: 6pt; color: #666; text-transform: uppercase; }
  .price-val { font-size: 9pt; font-weight: bold; }
  .bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm; margin-top: 2mm; font-size: 7pt; }
  .disclaimer { margin-top: 2mm; font-size: 6pt; color: #CC0000; text-align: center; font-weight: bold; border-top: 0.5pt solid #CC0000; padding-top: 1mm; }
  .collected-row { font-size: 7pt; margin-top: 1mm; }
</style>
</head>
<body>
  ${isOnline ? '<div class="online-banner">ONLINE ORDER</div>' : ""}

  <div class="header">
    <div class="store-name">CLASS A JEWELLERS</div>
    <div class="store-addr">40 North East Road, Walkerville SA 5081 &bull; +61 8 8344 7722</div>
  </div>

  <div class="ref-row">
    <div>
      <div class="ref-num">${esc(packet.reference_number)}</div>
      <div class="barcode-placeholder">||||| ${esc(packet.reference_number)} |||||</div>
    </div>
    <div class="due-box">
      <span class="due-label">DUE DATE</span>
      ${esc(formatDateAU(packet.due_date))}
    </div>
  </div>

  <div class="grid">
    <div class="field"><div class="field-label">Name</div>${esc(customerName)}</div>
    <div class="field"><div class="field-label">In Date</div>${esc(formatDateAU(packet.in_date))}</div>
    <div class="field"><div class="field-label">Address</div>${esc(addressLine)}</div>
    <div class="field"><div class="field-label">Cust #</div>${esc(packet.customer_number)}</div>
    <div class="field"><div class="field-label">Phone</div>${esc(packet.customer_phone)}</div>
    <div class="field"><div class="field-label">Stock #</div>${esc(packet.stock_number)}</div>
    <div class="field"><div class="field-label">Email</div>${esc(packet.customer_email)}</div>
    <div class="field"><div class="field-label">Valuation Req.</div>${packet.valuation_required ? "YES" : "NO"} &bull; Contact: ${esc(contactPref)}</div>
    ${isOnline ? `
    <div class="field"><div class="field-label">Order #</div>${esc(packet.order_number)}</div>
    <div class="field"><div class="field-label">Ship Method</div>${esc(packet.shipping_method)}</div>
    ` : ""}

    <div class="field full-width articles">
      <div class="field-label">${isOnline ? "Items Ordered" : "Articles"}</div>
      ${esc(isOnline ? packet.items_ordered : packet.articles)}
    </div>
    <div class="field full-width instructions">
      <div class="field-label">${isOnline ? "Order Notes" : "Instructions"}</div>
      ${esc(isOnline ? packet.order_notes : packet.instructions)}
    </div>
  </div>

  <div class="pricing">
    <div class="price-item">
      <div class="price-label">Total Charges</div>
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

  <div class="bottom">
    <div>
      <div class="field-label">Referral / Occasion / Staff</div>
      ${esc(packet.referral_source)} | ${esc(packet.occasion)} | ${esc(packet.staff_member)}
    </div>
    <div>
      <div class="field-label">Repair Tracker</div>
      ${esc(packet.repair_tracker_number ?? "")}
      <div class="collected-row">Collected: ___/___/___</div>
      <div class="collected-row">Signed: ____________________</div>
    </div>
  </div>

  <div class="disclaimer">
    THIS STORE IS NOT RESPONSIBLE FOR ARTICLES LEFT OVER 30 DAYS.
    NO ARTICLE CAN BE PICKED UP WITHOUT THIS RECEIPT.
  </div>
</body>
</html>`;
}
