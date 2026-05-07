"use client";

import { LineItem } from "@/lib/types";
import { formatCurrency } from "@/lib/formatters";

interface Props {
  lineItems: LineItem[];
  onChange: (lineItems: LineItem[]) => void;
}

export default function QuoteLineItems({ lineItems, onChange }: Props) {
  const total = lineItems.reduce((sum, li) => sum + (li.price || 0), 0);

  function addItem() {
    onChange([...lineItems, { description: "", price: 0 }]);
  }

  function removeItem(index: number) {
    onChange(lineItems.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof LineItem, value: string) {
    const updated = lineItems.map((li, i) => {
      if (i !== index) return li;
      if (field === "price") {
        const n = parseFloat(value);
        return { ...li, price: isNaN(n) ? 0 : n };
      }
      return { ...li, [field]: value };
    });
    onChange(updated);
  }

  const inputClass =
    "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black";

  return (
    <div className="space-y-3">
      {lineItems.length === 0 && (
        <p className="text-sm text-gray-400 italic">No line items added yet.</p>
      )}

      {lineItems.map((li, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            value={li.description}
            onChange={(e) => updateItem(i, "description", e.target.value)}
            placeholder="Description"
            className={`${inputClass} flex-1`}
          />
          <input
            type="number"
            value={li.price === 0 ? "" : li.price}
            onChange={(e) => updateItem(i, "price", e.target.value)}
            placeholder="0.00"
            min={0}
            step={0.01}
            className={`${inputClass} w-28`}
          />
          <button
            type="button"
            onClick={() => removeItem(i)}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-100 transition-colors font-bold text-lg leading-none"
            title="Remove"
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
        + Add Line Item
      </button>

      {lineItems.length > 0 && (
        <div className="flex justify-end pt-2 border-t border-gray-200">
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total</div>
            <div className="text-lg font-bold text-black">{formatCurrency(total)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
