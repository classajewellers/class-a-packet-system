"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { PacketFormData } from "@/lib/types";

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          Autocomplete?: new (
            el: HTMLInputElement,
            opts: object
          ) => {
            addListener: (event: string, cb: () => void) => void;
            getPlace: () => {
              address_components?: Array<{
                long_name: string;
                short_name: string;
                types: string[];
              }>;
            };
          };
        };
      };
    };
  }
}

interface Props {
  data: PacketFormData;
  onChange: (field: keyof PacketFormData, value: string) => void;
  errors: Partial<Record<keyof PacketFormData, string>>;
}

function Field({
  label,
  required,
  error,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-black mb-1">
        {label}
        {required && <span className="text-black ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
  hasError = false,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  hasError?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  return (
    <input
      ref={inputRef}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`
        w-full rounded-lg border px-3 py-2.5 text-sm text-black
        focus:outline-none focus:ring-2 focus:ring-black focus:border-black
        ${hasError ? "border-red-500 bg-red-50" : "border-gray-300 bg-white"}
        ${className}
      `}
    />
  );
}

export default function CustomerSection({ data, onChange, errors }: Props) {
  const { user } = useUser();
  const streetInputRef = useRef<HTMLInputElement>(null);
  const shopifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLookedUpEmail = useRef<string>("");
  const [shopifyFound, setShopifyFound] = useState(false);

  // ── Shopify customer lookup (debounced 500ms on email change) ────────────
  useEffect(() => {
    const email = data.customer_email.trim();

    // Reset badge when email is cleared or changed
    setShopifyFound(false);

    // Clear any pending timer
    if (shopifyTimerRef.current) clearTimeout(shopifyTimerRef.current);

    // Don't look up if email hasn't changed since last lookup, is short, or has no @
    if (!email || !email.includes("@") || email === lastLookedUpEmail.current) return;

    shopifyTimerRef.current = setTimeout(async () => {
      lastLookedUpEmail.current = email;
      try {
        const res = await fetch(
          `/api/shopify/customer?email=${encodeURIComponent(email)}`,
          { headers: { 'x-tenant-id': user?.tenantId ?? '' } }
        );
        if (!res.ok) return;
        const json = await res.json() as {
          customer: {
            first_name: string | null;
            last_name: string | null;
            phone: string | null;
            street: string | null;
            suburb: string | null;
            state: string | null;
            postcode: string | null;
          } | null;
        };
        if (!json.customer) return;

        const c = json.customer;
        // Only fill fields that are still blank to avoid overwriting staff input
        if (c.first_name && !data.customer_first_name)
          onChange("customer_first_name", c.first_name);
        if (c.last_name && !data.customer_last_name)
          onChange("customer_last_name", c.last_name);
        if (c.phone && !data.customer_phone)
          onChange("customer_phone", c.phone);
        if (c.street && !data.customer_street)
          onChange("customer_street", c.street);
        if (c.suburb && !data.customer_suburb)
          onChange("customer_suburb", c.suburb);
        if (c.state && !data.customer_state)
          onChange("customer_state", c.state);
        if (c.postcode && !data.customer_postcode)
          onChange("customer_postcode", c.postcode);

        setShopifyFound(true);
      } catch {
        // Silently ignore network errors — Shopify lookup is best-effort
      }
    }, 500);

    return () => {
      if (shopifyTimerRef.current) clearTimeout(shopifyTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.customer_email]);

  useEffect(() => {
    const el = streetInputRef.current;
    if (!el || typeof window === "undefined") return;

    const tryAttach = () => {
      const Autocomplete = window.google?.maps?.places?.Autocomplete;
      if (!Autocomplete) return;

      const autocomplete = new Autocomplete(el, {
        componentRestrictions: { country: "au" },
        types: ["address"],
        fields: ["address_components"],
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const components = place.address_components ?? [];

        const get = (type: string, short = false) => {
          const c = components.find((comp) => comp.types.includes(type));
          return c ? (short ? c.short_name : c.long_name) : "";
        };

        const streetNumber = get("street_number");
        const route = get("route");
        const street = [streetNumber, route].filter(Boolean).join(" ");
        const suburb = get("locality") || get("sublocality");
        const state = get("administrative_area_level_1", true);
        const postcode = get("postal_code");

        if (street) onChange("customer_street", street);
        if (suburb) onChange("customer_suburb", suburb);
        if (state) onChange("customer_state", state);
        if (postcode) onChange("customer_postcode", postcode);
      });
    };

    // Google Maps may not be loaded yet — poll until available
    if (window.google?.maps?.places?.Autocomplete) {
      tryAttach();
    } else {
      const interval = setInterval(() => {
        if (window.google?.maps?.places?.Autocomplete) {
          clearInterval(interval);
          tryAttach();
        }
      }, 300);
      return () => clearInterval(interval);
    }
  }, [onChange]);

  const inputClass =
    "w-full rounded-lg border px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black border-gray-300 bg-white";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First Name" required error={errors.customer_first_name}>
          <Input
            value={data.customer_first_name}
            onChange={(v) => onChange("customer_first_name", v)}
            placeholder="Jane"
            hasError={!!errors.customer_first_name}
          />
        </Field>
        <Field label="Last Name" required error={errors.customer_last_name}>
          <Input
            value={data.customer_last_name}
            onChange={(v) => onChange("customer_last_name", v)}
            placeholder="Smith"
            hasError={!!errors.customer_last_name}
          />
        </Field>
      </div>

      {/* Street with Google Places Autocomplete */}
      <Field label="Street Address" error={errors.customer_street}>
        <Input
          inputRef={streetInputRef}
          value={data.customer_street}
          onChange={(v) => onChange("customer_street", v)}
          placeholder="Start typing address…"
          hasError={!!errors.customer_street}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Suburb" className="col-span-1" error={errors.customer_suburb}>
          <input
            type="text"
            value={data.customer_suburb}
            onChange={(e) => onChange("customer_suburb", e.target.value)}
            placeholder="Suburb"
            className={inputClass}
          />
        </Field>
        <Field label="State" className="col-span-1" error={errors.customer_state}>
          <input
            type="text"
            value={data.customer_state}
            onChange={(e) => onChange("customer_state", e.target.value)}
            placeholder="SA"
            className={inputClass}
          />
        </Field>
        <Field label="Postcode" className="col-span-1" error={errors.customer_postcode}>
          <input
            type="tel"
            value={data.customer_postcode}
            onChange={(e) => onChange("customer_postcode", e.target.value)}
            placeholder="5000"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Customer No." error={errors.customer_number}>
          <Input
            value={data.customer_number}
            onChange={(v) => onChange("customer_number", v)}
            placeholder="Optional"
          />
        </Field>
        <Field label="Stock No." error={errors.stock_number}>
          <Input
            value={data.stock_number}
            onChange={(v) => onChange("stock_number", v)}
            placeholder="Optional"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" required error={errors.customer_phone}>
          <Input
            value={data.customer_phone}
            onChange={(v) => onChange("customer_phone", v)}
            placeholder="+61 4XX XXX XXX"
            type="tel"
            hasError={!!errors.customer_phone}
          />
        </Field>
        <div>
          <label className="block text-sm font-semibold text-black mb-1 flex items-center gap-2">
            Email<span className="text-black">*</span>
            {shopifyFound && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Found in Shopify
              </span>
            )}
          </label>
          <Input
            value={data.customer_email}
            onChange={(v) => onChange("customer_email", v)}
            placeholder="jane@example.com"
            type="email"
            hasError={!!errors.customer_email}
          />
          {errors.customer_email && (
            <p className="mt-1 text-xs text-red-600">{errors.customer_email}</p>
          )}
        </div>
      </div>
    </div>
  );
}
