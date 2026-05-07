"use client";

import { LineItem } from "@/lib/types";

interface Props {
  lineItems: LineItem[];
  onChange: (lineItems: LineItem[]) => void;
}

const EMPTY_ITEM: LineItem = { item: "", stone: "", price: "" };

export default function QuoteLineItems({ lineItems, onChange }: Props) {
  function addItem() {
    onChange([...lineItems, { ...EMPTY_ITEM }]);
  }

  function removeItem(index: number) {
    onChange(lineItems.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof LineItem, value: string) {
    onChange(lineItems.map((li, i) => (i === index ? { ...li, [field]: value } : li)));
  }

  const inputClass =
    "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black w-full";

  return (
    <div className="space-y-3">
      {lineItems.length === 0 && (
        <p className="text-sm text-gray-400 italic">No line items added yet.</p>
      )}

      {lineItems.map((li, i) => (
        <div key={i} className="flex gap-2 items-center">
          {/* Item */}
          <input
            type="text"
            value={li.item}
            onChange={(e) => updateItem(i, "item", e.target.value)}
            placeholder="Item (e.g. Resize ring)"
            className={`${inputClass} flex-[3]`}
          />
          {/* Stone */}
          <input
            type="text"
            value={li.stone}
            onChange={(e) => updateItem(i, "stone", e.target.value)}
            placeholder="Stone (optional)"
            className={`${inputClass} flex-[2]`}
          />
          {/* Price */}
          <input
            type="text"
            value={li.price}
            onChange={(e) => updateItem(i, "price", e.target.value)}
            placeholder="$450 / POA"
            className={`${inputClass} flex-[1] min-w-[80px]`}
          />
          {/* Remove */}
          <button
            type="button"
            onClick={() => removeItem(i)}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-100 transition-colors font-bold text-lg leading-none"
            title="Remove row"
          >
            &times;
          </button>
        </div>
      ))}

      {lineItems.length > 0 && (
        <div className="grid grid-cols-[3fr_2fr_1fr_32px] gap-2 px-0.5 mb-0">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Item</p>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Stone</p>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Price</p>
          <span />
        </div>
      )}

      <button
        type="button"
        onClick={addItem}
        className="text-sm font-semibold text-black border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
      >
        + Add Line Item
      </button>
    </div>
  );
}
