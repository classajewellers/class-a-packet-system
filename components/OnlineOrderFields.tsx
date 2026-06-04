"use client";

import { PacketFormData } from "@/lib/types";

interface Props {
  data: PacketFormData;
  onChange: (field: keyof PacketFormData, value: string | boolean) => void;
  errors: Partial<Record<keyof PacketFormData, string>>;
}

const SHIPPING_METHODS = [
  "Standard Post",
  "Express Post",
  "Click & Collect",
  "Courier",
];

const ORDER_SOURCES = [
  "Website",
  "Phone order",
  "Email order",
];

const selectClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black";

const textareaClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black resize-none";

export default function OnlineOrderFields({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-black mb-1">
            Order Number<span className="text-black ml-0.5">*</span>
          </label>
          <input
            type="text"
            value={data.order_number}
            onChange={(e) => onChange("order_number", e.target.value)}
            placeholder="e.g. #1234 or SHP-5678"
            className={`${inputClass} ${errors.order_number ? "border-red-500 bg-red-50" : ""}`}
          />
          {errors.order_number && (
            <p className="mt-1 text-xs text-red-600">{errors.order_number}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-black mb-1">
            Order Source
          </label>
          <select
            value={data.order_source}
            onChange={(e) => onChange("order_source", e.target.value)}
            className={selectClass}
          >
            <option value="">— Select —</option>
            {ORDER_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-black mb-1">
          Shipping Method
        </label>
        <select
          value={data.shipping_method}
          onChange={(e) => onChange("shipping_method", e.target.value)}
          className={selectClass}
        >
          <option value="">— Select —</option>
          {SHIPPING_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Shipping address same as above? */}
      <div>
        <label className="block text-sm font-semibold text-black mb-2">
          Shipping address same as customer address?
        </label>
        <div className="flex gap-3">
          {[true, false].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => onChange("shipping_address_same", val)}
              className={`
                flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold transition-all
                ${
                  data.shipping_address_same === val
                    ? "border-black bg-[#635BFF] text-white"
                    : "border-gray-300 bg-white text-black hover:border-black"
                }
              `}
            >
              {val ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>

      {/* Separate shipping address block */}
      {!data.shipping_address_same && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Shipping Address</p>
          <input
            type="text"
            value={data.shipping_street}
            onChange={(e) => onChange("shipping_street", e.target.value)}
            placeholder="Street address"
            className={inputClass}
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={data.shipping_suburb}
              onChange={(e) => onChange("shipping_suburb", e.target.value)}
              placeholder="Suburb"
              className={inputClass}
            />
            <input
              type="text"
              value={data.shipping_state}
              onChange={(e) => onChange("shipping_state", e.target.value)}
              placeholder="State"
              className={inputClass}
            />
            <input
              type="tel"
              value={data.shipping_postcode}
              onChange={(e) => onChange("shipping_postcode", e.target.value)}
              placeholder="Postcode"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* Jewellery details — required for PCN / charm necklace orders */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-black mb-1">
            Carat Weight (ct)
          </label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={data.carat_weight}
            onChange={(e) => onChange("carat_weight", e.target.value)}
            placeholder="e.g. 1.5"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-black mb-1">
            Metal Colour
          </label>
          <select
            value={data.metal_colour}
            onChange={(e) => onChange("metal_colour", e.target.value)}
            className={selectClass}
          >
            <option value="">— Select —</option>
            <option>Yellow Gold</option>
            <option>White Gold</option>
            <option>Rose Gold</option>
            <option>Sterling Silver</option>
            <option>Platinum</option>
            <option>Two-Tone</option>
            <option>Other</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-black mb-1">
          Items Ordered
        </label>
        <textarea
          value={data.items_ordered}
          onChange={(e) => onChange("items_ordered", e.target.value)}
          placeholder="List all items in the order…"
          rows={3}
          className={textareaClass}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-black mb-1">
          Order Notes
        </label>
        <textarea
          value={data.order_notes}
          onChange={(e) => onChange("order_notes", e.target.value)}
          placeholder="Any special instructions or notes…"
          rows={2}
          className={textareaClass}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-black mb-1">
          Tracking Number
          <span className="text-gray-400 font-normal ml-1">(optional — can add later)</span>
        </label>
        <input
          type="text"
          value={data.tracking_number}
          onChange={(e) => onChange("tracking_number", e.target.value)}
          placeholder="e.g. 7NE12345678"
          className={inputClass}
        />
      </div>
    </div>
  );
}
