// Receive Stock → inventory_pieces.
//
// PO lines and pieces do not share a column set. Staging PO lines store
// stone_*; staging pieces store diamond_* and reject unknown keys entirely
// (same failure as the PO-line diamond_carat insert). Staging pieces also
// have no title, metal_type, category_id, status_id, or updated_at, and
// metal_karat / metal_colour / diamond_type are check-constrained.
// Callers probe those columns and pass the flags in. This module only
// decides the row; it does not query.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// inventory_pieces_metal_karat_check (staging). PO lines store the same
// karats as free text ("18ct" is the PO form placeholder).
const KARAT_ALIASES: Record<string, string> = {
  "9ct": "9K",
  "9k": "9K",
  "9kt": "9K",
  "14ct": "14K",
  "14k": "14K",
  "14kt": "14K",
  "18ct": "18K",
  "18k": "18K",
  "18kt": "18K",
  "22ct": "22K",
  "22k": "22K",
  "22kt": "22K",
  "24ct": "24K",
  "24k": "24K",
  "24kt": "24K",
  platinum: "Platinum",
  silver: "Silver",
  other: "Other",
};

// inventory_pieces_metal_colour_check
const METAL_COLOURS = ["Yellow", "White", "Rose", "Two-Tone", "Tri-Colour", "N/A", "Other"];

// inventory_pieces_diamond_type_check (also includes Moissanite)
const DIAMOND_TYPES = ["Natural", "Lab Grown", "Moissanite", "None"];

export interface PieceColumnFlags {
  title: boolean;
  category_id: boolean;
  metal_type: boolean;
  status_id: boolean;
  updated_at: boolean;
  status: boolean;
  cost_price: boolean;
  notes: boolean;
  actual_cost: boolean;
  supplier_code: boolean;
  created_at: boolean;
  // Vault is adding these. Absent on Preview until that migration lands.
  // When false, the insert must not mention them (PostgREST rejects the row).
  supplier_id: boolean;
  packet_id: boolean;
}

export interface ReceiveLineSource {
  title?: string | null;
  notes?: string | null;
  category_id?: string | null;
  metal_type?: string | null;
  metal_karat?: string | null;
  metal_colour?: string | null;
  stone_type?: string | null;
  stone_carat?: number | string | null;
  stone_colour?: string | null;
  stone_clarity?: string | null;
  diamond_type?: string | null;
  diamond_carat?: number | string | null;
  diamond_colour?: string | null;
  diamond_clarity?: string | null;
  finger_size?: string | null;
  estimated_cost?: number | string | null;
  unit_cost?: number | string | null;
  supplier_design_no?: string | null;
}

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = blankToNull(value);
    if (text) return text;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value == null || value === "") continue;
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function firstUuid(...values: unknown[]): string | null {
  const text = firstText(...values);
  if (!text || !UUID_RE.test(text)) return null;
  return text;
}

function matchAllowed(raw: string | null, allowed: string[]): string | null {
  if (!raw) return null;
  return allowed.find((item) => item.toLowerCase() === raw.trim().toLowerCase()) ?? null;
}

/** Title shown on Receive Stock. Notes count as the line description. */
export function inheritedReceiveTitle(line: { title?: string | null; notes?: string | null }): string {
  return firstText(line.title, line.notes) ?? "";
}

/**
 * When the line has no title and no notes, show the details it does have:
 * category, metal, and expected cost. Blank fields are left out.
 */
export function fallbackReceiveTitle(line: {
  title?: string | null;
  notes?: string | null;
  categoryName?: string | null;
  metal_karat?: string | null;
  metal_colour?: string | null;
  metal_type?: string | null;
  estimated_cost?: number | string | null;
  unit_cost?: number | string | null;
}): string {
  const explicit = inheritedReceiveTitle(line);
  if (explicit) return explicit;
  const metal = [line.metal_karat, line.metal_colour, line.metal_type]
    .map((value) => (value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const costRaw = line.estimated_cost ?? line.unit_cost;
  let cost = "";
  if (costRaw != null && String(costRaw).trim() !== "") {
    const amount = Number(costRaw);
    if (Number.isFinite(amount)) {
      cost = `$${amount.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }
  const category = (line.categoryName ?? "").trim();
  return [category, metal, cost].filter(Boolean).join(" · ");
}

export function pieceMetalKarat(raw: string | null): string | null {
  if (!raw) return null;
  const compact = raw.trim().toLowerCase().replace(/\s+/g, "");
  return KARAT_ALIASES[compact] ?? null;
}

export interface ReceivedPieceInput {
  line: ReceiveLineSource;
  specs?: Record<string, unknown>;
  flags: PieceColumnFlags;
  actualUnitCost?: unknown;
  statusId?: string | null;
  locationId?: string | null;
  categoryName?: string | null;
  now: string;
  poLineId: string;
  receivingEventId: string;
  quantity: number;
  /** From the purchase order. Written only when the piece column exists. */
  supplierId?: string | null;
  /** From the PO line. Written only when the piece column exists. */
  packetId?: string | null;
}

/**
 * Columns for one inventory_pieces insert. Client specs win when they
 * contain a value; a blank field falls back to the PO line so details
 * already on the line are not dropped. Values that cannot be stored in
 * a constrained column are kept on notes.
 */
export function buildReceivedPieceRow(input: ReceivedPieceInput): Record<string, unknown> {
  const specs = input.specs ?? {};
  const line = input.line;
  const flags = input.flags;

  const title = firstText(specs.title, line.title, line.notes);
  const notes = firstText(specs.notes, line.notes);
  const metalType = firstText(specs.metal_type, line.metal_type);
  const karatRaw = firstText(specs.metal_karat, line.metal_karat);
  const colourRaw = firstText(specs.metal_colour, line.metal_colour);
  const stoneTypeRaw = firstText(specs.diamond_type, specs.stone_type, line.diamond_type, line.stone_type);
  const stoneColour = firstText(specs.diamond_colour, specs.stone_colour, line.diamond_colour, line.stone_colour);
  const stoneClarity = firstText(specs.diamond_clarity, specs.stone_clarity, line.diamond_clarity, line.stone_clarity);
  const stoneCarat = firstNumber(specs.diamond_carat, specs.stone_carat, line.diamond_carat, line.stone_carat);
  const fingerSize = firstText(specs.finger_size, line.finger_size);
  const categoryId = firstUuid(specs.category_id, line.category_id);
  const productId = firstUuid(specs.product_id);
  const supplierCode = firstText(specs.supplier_code, line.supplier_design_no);
  const actualCost = firstNumber(input.actualUnitCost, line.estimated_cost, line.unit_cost);

  const karatStored = pieceMetalKarat(karatRaw);
  const colourStored = matchAllowed(colourRaw, METAL_COLOURS);
  const diamondStored = matchAllowed(stoneTypeRaw, DIAMOND_TYPES);

  const preserved: string[] = [];
  if (!flags.metal_type && metalType) preserved.push(`Metal type: ${metalType}`);
  if (!flags.category_id && input.categoryName) preserved.push(`Category: ${input.categoryName}`);
  if (karatRaw && !karatStored) preserved.push(`Metal karat: ${karatRaw}`);
  if (colourRaw && !colourStored) preserved.push(`Metal colour: ${colourRaw}`);
  if (stoneTypeRaw && !diamondStored) preserved.push(`Stone type: ${stoneTypeRaw}`);

  let notesOut = notes;
  // No title column: keep the line title in notes so the description is not discarded.
  if (!flags.title && title && title !== notesOut) {
    notesOut = notesOut ? `${title}\n${notesOut}` : title;
  }
  for (const bit of preserved) {
    if (!notesOut) notesOut = bit;
    else if (!notesOut.includes(bit)) notesOut = `${notesOut}\n${bit}`;
  }

  const row: Record<string, unknown> = {
    po_line_id: input.poLineId,
    receiving_event_id: input.receivingEventId,
    quantity: input.quantity,
    location_id: input.locationId ?? null,
    metal_karat: karatStored,
    metal_colour: colourStored,
    diamond_type: diamondStored,
    diamond_carat: stoneCarat,
    diamond_colour: stoneColour,
    diamond_clarity: stoneClarity,
    finger_size: fingerSize,
  };

  if (productId) row.product_id = productId;
  if (flags.notes) row.notes = notesOut;
  if (flags.actual_cost) row.actual_cost = actualCost;
  if (flags.cost_price) row.cost_price = actualCost;
  if (flags.supplier_code && supplierCode) row.supplier_code = supplierCode;
  // Staging pieces require the text status and have no status_id.
  // Where status_id exists, keep that model and do not also force the text enum.
  if (flags.status && !flags.status_id) row.status = "in_stock";
  if (flags.status_id) row.status_id = input.statusId ?? null;
  if (flags.title) row.title = title;
  if (flags.metal_type) row.metal_type = metalType;
  if (flags.category_id) row.category_id = categoryId;
  if (flags.created_at) row.created_at = input.now;
  if (flags.updated_at) row.updated_at = input.now;

  // Stamp provenance once Vault's columns exist. Omit the key entirely
  // while the column is missing, and omit it when the PO has no value,
  // so a null supplier does not fail a foreign key.
  if (flags.supplier_id) {
    const supplierId = firstUuid(input.supplierId);
    if (supplierId) row.supplier_id = supplierId;
  }
  if (flags.packet_id) {
    const packetId = firstUuid(input.packetId);
    if (packetId) row.packet_id = packetId;
  }

  return row;
}
