"use client";

import { useEffect, useRef, useState } from "react";

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
  hasError?: boolean;
  style?: React.CSSProperties;
}

// ── Type stubs for classic Places Autocomplete API ────────────────────────────

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleAutocomplete {
  addListener(event: "place_changed", handler: () => void): void;
  getPlace(): {
    address_components?: GoogleAddressComponent[];
    formatted_address?: string;
  };
}

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          Autocomplete?: new (
            input: HTMLInputElement,
            opts?: {
              componentRestrictions?: { country: string | string[] };
              fields?: string[];
              types?: string[];
            }
          ) => GoogleAutocomplete;
        };
      };
    };
  }
}

// ── Base input style (shared between autocomplete and manual fields) ──────────

const baseStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
  fontSize: 14,
  color: "#1A1A2E",
  border: "1px solid #E8E8F0",
  borderRadius: 8,
  padding: "0 12px",
  height: 40,
  background: "#fff",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  onBlur,
  placeholder = "Start typing address…",
  hasError,
  style,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<GoogleAutocomplete | null>(null);

  // Keep callbacks in refs so the event listener closure is always current
  const onChangeRef = useRef(onChange);
  const onSelectRef = useRef(onSelect);
  const onBlurRef = useRef(onBlur);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onBlurRef.current = onBlur; }, [onBlur]);

  const [focused, setFocused] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState({ street: "", suburb: "", state: "", postcode: "" });

  // ── Attach classic Autocomplete once after mount ───────────────────────────
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function attach(): boolean {
      const input = inputRef.current;
      const AC = window.google?.maps?.places?.Autocomplete;
      if (!input || !AC) return false;

      console.log("[AddressAutocomplete] attaching classic Autocomplete to input");
      const ac = new AC(input, {
        componentRestrictions: { country: "au" },
        fields: ["address_components", "formatted_address"],
        types: ["address"],
      });
      autocompleteRef.current = ac;

      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        console.log("[AddressAutocomplete] place_changed fired");
        console.log("[AddressAutocomplete] raw address_components:", place.address_components);

        if (!place.address_components) {
          // User pressed Enter without selecting from dropdown — no structured data
          console.warn("[AddressAutocomplete] no address_components in place result");
          return;
        }

        const get = (type: string, short = false): string => {
          const c = place.address_components!.find(comp => comp.types.includes(type));
          return c ? (short ? c.short_name : c.long_name) : "";
        };

        const street   = [get("street_number"), get("route")].filter(Boolean).join(" ");
        const suburb   = get("locality") || get("sublocality_level_1") || get("sublocality");
        const state    = get("administrative_area_level_1", true); // short_name → SA, VIC, etc.
        const postcode = get("postal_code");
        const full_address = place.formatted_address ??
          [street, suburb, state, postcode].filter(Boolean).join(", ");

        console.log("[AddressAutocomplete] parsed →", { street, suburb, state, postcode, full_address });

        // Set the street field in the parent form
        if (street) onChangeRef.current(street);

        // Fire onSelect so parent can populate suburb / state / postcode
        console.log("[AddressAutocomplete] calling onSelect with:", { full_address, street, suburb, state, postcode });
        onSelectRef.current({ full_address, street, suburb, state, postcode });
      });

      return true;
    }

    if (!attach()) {
      intervalId = setInterval(() => {
        if (attach()) {
          clearInterval(intervalId!);
          intervalId = null;
        }
      }, 300);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      autocompleteRef.current = null;
    };
  }, []); // attach once after mount — no deps needed

  // ── Manual entry helpers ──────────────────────────────────────────────────

  function switchToManual() {
    setManual({ street: value, suburb: "", state: "", postcode: "" });
    setManualMode(true);
  }

  function switchToSearch() {
    setManualMode(false);
  }

  function updateManual(field: keyof typeof manual, val: string) {
    const next = { ...manual, [field]: val };
    setManual(next);
    if (field === "street") onChangeRef.current(val);
    onSelectRef.current({
      full_address: [next.street, next.suburb, next.state, next.postcode].filter(Boolean).join(", "),
      street: next.street,
      suburb: next.suburb,
      state: next.state,
      postcode: next.postcode,
    });
  }

  // ── Compute autocomplete input style (error + focus variants) ────────────

  const searchInputStyle: React.CSSProperties = {
    ...baseStyle,
    ...(hasError ? { borderColor: "#EF4444", background: "#FEF2F2" } : {}),
    ...(focused && !hasError ? {
      borderColor: "#635BFF",
      boxShadow: "0 0 0 2px rgba(99, 91, 255, 0.15)",
    } : {}),
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: "100%", ...style }}>
      {/* Autocomplete search input — hidden (not destroyed) when in manual mode
          so the Autocomplete instance stays attached to the DOM node */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChangeRef.current(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => { setFocused(false); onBlurRef.current?.(e.target.value); }}
        placeholder={placeholder}
        autoComplete="off"
        style={{ ...searchInputStyle, display: manualMode ? "none" : undefined }}
      />

      {/* Manual entry fields */}
      {manualMode && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            type="text"
            placeholder="Street Address"
            value={manual.street}
            onChange={(e) => updateManual("street", e.target.value)}
            onBlur={() => onBlurRef.current?.(manual.street)}
            style={baseStyle}
            autoComplete="off"
          />
          <input
            type="text"
            placeholder="Suburb"
            value={manual.suburb}
            onChange={(e) => updateManual("suburb", e.target.value)}
            style={baseStyle}
            autoComplete="off"
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <input
              type="text"
              placeholder="State (e.g. SA)"
              value={manual.state}
              onChange={(e) => updateManual("state", e.target.value)}
              style={baseStyle}
              autoComplete="off"
            />
            <input
              type="text"
              placeholder="Postcode"
              value={manual.postcode}
              onChange={(e) => updateManual("postcode", e.target.value)}
              style={baseStyle}
              autoComplete="off"
            />
          </div>
        </div>
      )}

      {/* Toggle link */}
      <div style={{ marginTop: 4 }}>
        <button
          type="button"
          onClick={manualMode ? switchToSearch : switchToManual}
          style={{
            fontSize: 12,
            color: "#9CA3AF",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textDecoration: "underline",
          }}
        >
          {manualMode ? "Use address search" : "Enter address manually"}
        </button>
      </div>
    </div>
  );
}
