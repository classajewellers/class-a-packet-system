// Piece passport: where a stock piece came from.
//
// inventory_pieces stores supplier_id, packet_id, and invoice_id, plus
// po_line_id and receiving_event_id. invoice_id stays empty until a later
// step. This module only chooses which already-loaded row to show.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PassportPacket {
  id: string;
  reference_number: string | null;
  customer_name: string | null;
}

export interface PassportPurchaseOrder {
  id: string;
  po_number: string | null;
  status: string | null;
  order_date: string | null;
  expected_date: string | null;
}

export interface PassportSupplier {
  id: string | null;
  name: string | null;
}

export interface PassportInvoice {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  status: string | null;
  total_amount: number | null;
}

export interface PassportJob {
  id: string;
  stage: string | null;
  job_type: string | null;
  reference_number: string | null;
}

export interface PiecePassport {
  linked: boolean;
  what: string | null;
  category: string | null;
  packet: PassportPacket | null;
  packet_source: "piece" | "line" | null;
  job: PassportJob | null;
  purchase_order: PassportPurchaseOrder | null;
  supplier: PassportSupplier | null;
  supplier_source: "piece" | "po" | null;
  received_at: string | null;
  invoice: PassportInvoice | null;
  invoice_source: "piece" | "po" | null;
}

export interface PassportLine {
  id: string;
  po_id: string | null;
  title: string | null;
  notes: string | null;
  packet_id: string | null;
  category_name: string | null;
  metal_karat: string | null;
  metal_colour: string | null;
  metal_type: string | null;
}

export interface PassportAssembleInput {
  poLineId: string | null;
  receivingEventId: string | null;
  pieceSupplierId: string | null;
  piecePacketId: string | null;
  line: PassportLine | null;
  purchaseOrder: PassportPurchaseOrder | null;
  /** Supplier stored on the purchase order, when the order has one. */
  poSupplierId: string | null;
  poSupplierName: string | null;
  supplierById: Record<string, string>;
  packetById: Record<string, PassportPacket>;
  receivedAt: string | null;
  /** Already chosen by the caller: the piece's invoice, else one linked to the PO. */
  invoice: PassportInvoice | null;
  invoiceSource: "piece" | "po" | null;
  job: PassportJob | null;
}

function uuidOrNull(value: string | null | undefined): string | null {
  if (!value || !UUID_RE.test(value)) return null;
  return value;
}

function textOrNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

export function assemblePiecePassport(input: PassportAssembleInput): PiecePassport {
  const linePacketId = uuidOrNull(input.line?.packet_id);
  const piecePacketId = uuidOrNull(input.piecePacketId);
  const packetId = piecePacketId ?? linePacketId;
  const packet = packetId ? (input.packetById[packetId] ?? null) : null;

  const pieceSupplierId = uuidOrNull(input.pieceSupplierId);
  const poSupplierId = uuidOrNull(input.poSupplierId);
  let supplier: PassportSupplier | null = null;
  let supplierSource: PiecePassport["supplier_source"] = null;
  if (pieceSupplierId) {
    supplier = { id: pieceSupplierId, name: input.supplierById[pieceSupplierId] ?? null };
    supplierSource = "piece";
  } else if (poSupplierId || textOrNull(input.poSupplierName)) {
    supplier = {
      id: poSupplierId,
      name: (poSupplierId ? input.supplierById[poSupplierId] : null) ?? textOrNull(input.poSupplierName),
    };
    supplierSource = "po";
  }

  const invoice = input.invoice;

  const metal = [input.line?.metal_karat, input.line?.metal_colour, input.line?.metal_type]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const what = textOrNull(input.line?.title) ?? textOrNull(input.line?.notes) ?? textOrNull(metal);

  const linked = Boolean(
    uuidOrNull(input.poLineId)
    || uuidOrNull(input.receivingEventId)
    || packet
    || input.purchaseOrder
  );

  return {
    linked,
    what,
    category: textOrNull(input.line?.category_name),
    packet: packet ?? (packetId ? { id: packetId, reference_number: null, customer_name: null } : null),
    packet_source: piecePacketId ? "piece" : linePacketId ? "line" : null,
    job: input.job?.id ? input.job : null,
    purchase_order: input.purchaseOrder,
    supplier,
    supplier_source: supplier ? supplierSource : null,
    received_at: textOrNull(input.receivedAt),
    invoice,
    invoice_source: invoice ? input.invoiceSource : null,
  };
}
