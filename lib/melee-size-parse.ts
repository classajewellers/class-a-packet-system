// UNIT NOTE: size_from/size_to in pricing_melee_stones are NOT a single uniform unit.
//   carat_range rows → carats       (e.g. 0.025–0.03)
//   mm_range rows    → millimetres  (e.g. 0.90–1.20)
//   pieces_per_carat → piece count  (e.g. 200–150, inverse: more pieces = smaller stone)
// Points labels ('pt'/'pts') are converted ÷100 to carats and stored as carat_range.
// Any size-based lookup — calculate_price(), Stage 3 band pricing, or any future
// "find the matching row" query — MUST branch on size_type before comparing values.
// Never assume all rows are directly comparable as carats.
export function parseSizeLabel(label: string): {
  size_type: "carat_range" | "pieces_per_carat" | "mm_range";
  size_from: number | null;
  size_to: number | null;
} {
  const s = label.trim().toLowerCase();
  const nums = (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const rawFrom = nums[0] ?? null;
  const rawTo = nums.length > 1 ? nums[nums.length - 1] : rawFrom;

  if (/\d\s*pts?\b/.test(s)) {
    // Points: 1pt = 0.01 carat. Convert to carats and store as carat_range.
    return {
      size_type: "carat_range",
      size_from: rawFrom != null ? rawFrom / 100 : null,
      size_to:   rawTo   != null ? rawTo   / 100 : null,
    };
  }
  if (/\d\s*mm\b/.test(s)) {
    // Millimetres — stored as raw mm values (NOT converted to carats).
    return { size_type: "mm_range", size_from: rawFrom, size_to: rawTo };
  }
  if (/\d\s*pcs?\b/.test(s)) {
    // Pieces per carat — stored as raw piece counts (inverse: more = smaller stone).
    return { size_type: "pieces_per_carat", size_from: rawFrom, size_to: rawTo };
  }
  // Default: carat range (label ends in "ct"/"carat", or no recognizable unit).
  return { size_type: "carat_range", size_from: rawFrom, size_to: rawTo };
}
