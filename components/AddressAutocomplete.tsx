"use client";

// SETUP: Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to Vercel environment variables.
// Dashboard → Settings → Environment Variables → add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
// The Maps script is already loaded globally in app/layout.tsx.

import { useEffect, useRef } from "react";

export interface AddressResult {
  full_address: string;
  street: string;
  suburb: string;
  state: string;
  postcode: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  onBlur?: (value: string) => void;
  placeholder?: string;
  /** Tailwind className — used when rendering in form pages */
  className?: string;
  /** Inline style — used when rendering in drawers */
  style?: React.CSSProperties;
  hasError?: boolean;
}

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
              formatted_address?: string;
            };
          };
        };
      };
    };
  }
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  onBlur,
  placeholder = "Start typing address…",
  className,
  style,
  hasError,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const onSelectRef = useRef(onSelect);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el || typeof window === "undefined") return;

    const attach = (): boolean => {
      const Autocomplete = window.google?.maps?.places?.Autocomplete;
      if (!Autocomplete) return false;

      const ac = new Autocomplete(el, {
        componentRestrictions: { country: "au" },
        types: ["address"],
        fields: ["address_components", "formatted_address"],
      });

      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const components = place.address_components ?? [];

        const get = (type: string, short = false) => {
          const c = components.find((comp) => comp.types.includes(type));
          return c ? (short ? c.short_name : c.long_name) : "";
        };

        const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
        const suburb = get("locality") || get("sublocality");
        const state = get("administrative_area_level_1", true);
        const postcode = get("postal_code");
        const full_address =
          place.formatted_address ??
          [street, suburb, state, postcode].filter(Boolean).join(", ");

        if (street) onChangeRef.current(street);
        onSelectRef.current({ full_address, street, suburb, state, postcode });
      });

      return true;
    };

    if (!attach()) {
      const interval = setInterval(() => {
        if (attach()) clearInterval(interval);
      }, 300);
      return () => clearInterval(interval);
    }
  }, []); // attach once — callbacks accessed via refs

  const defaultClassName = [
    "w-full rounded-lg border px-3 py-2.5 text-sm text-black",
    "focus:outline-none focus:ring-2 focus:ring-black focus:border-black",
    hasError ? "border-red-500 bg-red-50" : "border-gray-300 bg-white",
  ].join(" ");

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
      placeholder={placeholder}
      style={style}
      className={className ?? defaultClassName}
      autoComplete="off"
    />
  );
}
