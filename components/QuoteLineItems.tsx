"use client";

import { LineItem } from "@/lib/types";

interface Props {
  lineItems: LineItem[];
  onChange: (lineItems: LineItem[]) => void;
  /** When true, the Cost Price column is visible. Pass false for staff role. */
  isManager: boolean;
}

const EMPTY_ITEM: LineItem = { design: "", stone: "", price: "", cost_price: "" };

export default function QuoteLineItems({ lineItems, onChange, isManager }: Props) {
  function addItem() {
    onChange([...lineItems, { ...EMPTY_ITEM }]);
  }

  function removeItem(index: number) {
    if (lineItems.length <= 1) return;
    onChange(lineItems.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof LineItem, value: string) {
    onChange(lineItems.map((li, i) => (i === index ? { ...li, [field]: value } : li)));
  }

  const inputClass =
    "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black w-full";

  // Grid: Design | Stone | Retail Price | [Cost Price — mgr only] | Remove
  const gridCols = isManager
    ? "grid-cols-[3fr_2fr_1fr_1fr_32px]"
    : "grid-cols-[3fr_2fr_1fr_32px]";

  return (
    <div className="space-y-2">
      {/* Column headers */}
      <div className={`grid ${gridCols} gap-2 px-0.5 mb-1`}>
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Design</p>
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Stone</p>
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Retail Price</p>
        {isManager && (
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#635BFF" }}>
            Cost Price
          </p>
        )}
        <span />
      </div>

      {lineItems.map((li, i) => (
        <div key={i} className={`grid ${gridCols} gap-2 items-center`}>
          {/* Design */}
          <input
            type="text"
            value={li.design}
            onChange={(e) => updateItem(i, "design", e.target.value)}
            placeholder="e.g. Diamond solitaire ring"
            className={inputClass}
          />
          {/* Stone */}
          <input
            type="text"
            value={li.stone}
            onChange={(e) => updateItem(i, "stone", e.target.value)}
            placeholder="Stone (optional)"
            className={inputClass}
          />
          {/* Retail Price */}
          <input
            type="text"
            value={li.price}
            onChange={(e) => updateItem(i, "price", e.target.value)}
            placeholder="$450 / POA"
            className={inputClass}
          />
          {/* Cost Price — manager/admin only */}
          {isManager && (
            <input
              type="text"
              value={li.cost_price ?? ""}
              onChange={(e) => updateItem(i, "cost_price", e.target.value)}
              placeholder="Our cost"
              className={inputClass}
              style={{ borderColor: "#C4BFFE" }}
            />
          )}
          {/* Remove */}
          <button
            type="button"
            onClick={() => removeItem(i)}
            disabled={lineItems.length <= 1}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors font-bold text-lg leading-none disabled:opacity-30 disabled:cursor-not-allowed"
            title="Remove row"
          >
            &times;
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addItem}
        className="text-sm font-semibold text-black border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
      >
        + Add Row
      </button>
    </div>
  );
}
