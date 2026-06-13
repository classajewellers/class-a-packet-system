"use client";

// SETUP: Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to Vercel environment variables.
// Dashboard → Settings → Environment Variables → add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
// The Maps script is loaded globally in app/layout.tsx.

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
  /** Pass only layout-level styles (e.g. width, margin). Visual styling is handled by injected CSS. */
  style?: React.CSSProperties;
}

// ── Type stubs for the new Places API ────────────────────────────────────────

interface GmpAddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

interface GmpPlace {
  addressComponents?: GmpAddressComponent[];
  formattedAddress?: string;
  fetchFields(opts: { fields: string[] }): Promise<{ place: GmpPlace }>;
}

interface GmpPlaceSelectEvent extends Event {
  place: GmpPlace;
}

interface GmpPlaceAutocompleteElement extends HTMLElement {
  value: string;
  addEventListener(type: "gmp-placeselect", listener: (e: GmpPlaceSelectEvent) => void): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: "gmp-placeselect", listener: (e: GmpPlaceSelectEvent) => void): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

declare global {
  interface Window {
    google?: {
      maps?: {
        importLibrary?: (lib: string) => Promise<Record<string, unknown>>;
        places?: {
          PlaceAutocompleteElement?: new (opts?: {
            componentRestrictions?: { country: string | string[] };
            types?: string[];
          }) => GmpPlaceAutocompleteElement;
        };
      };
    };
  }
}

// ── Global CSS injection (once per page) ─────────────────────────────────────

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const s = document.createElement("style");
  s.id = "gmp-autocomplete-styles";
  s.textContent = `
    gmp-placeautocomplete {
      display: block;
      width: 100%;
    }
    gmp-placeautocomplete::part(input) {
      width: 100%;
      box-sizing: border-box;
      font-family: inherit;
      font-size: 14px;
      color: #1A1A2E;
      border: 1px solid #E8E8F0;
      border-radius: 8px;
      padding: 0 12px;
      height: 40px;
      background: #fff;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    gmp-placeautocomplete::part(input):focus {
      border-color: #635BFF;
      box-shadow: 0 0 0 2px rgba(99, 91, 255, 0.15);
    }
    gmp-placeautocomplete[data-error]::part(input) {
      border-color: #EF4444;
      background: #FEF2F2;
    }
  `;
  document.head.appendChild(s);
}

// ── Shared input style for manual-entry fields ────────────────────────────────

const manualInputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #E8E8F0",
  borderRadius: 8,
  padding: "0 12px",
  height: 40,
  fontSize: 14,
  color: "#1A1A2E",
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
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
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<GmpPlaceAutocompleteElement | null>(null);

  // Keep callbacks in refs so closures inside useEffect are always current
  const onChangeRef = useRef(onChange);
  const onSelectRef = useRef(onSelect);
  const onBlurRef = useRef(onBlur);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onBlurRef.current = onBlur; }, [onBlur]);

  // mounted gates all client-only rendering — server and the first client
  // render produce identical output (the placeholder), so React hydrates cleanly.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Manual entry state
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState({ street: "", suburb: "", state: "", postcode: "" });

  // ── Sync controlled value into the gmp element ──────────────────────────────
  useEffect(() => {
    const el = elementRef.current;
    if (el && el.value !== value) el.value = value;
  }, [value]);

  // ── Toggle error attribute on the gmp element ────────────────────────────────
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;
    hasError ? el.setAttribute("data-error", "true") : el.removeAttribute("data-error");
  }, [hasError]);

  // ── Mount PlaceAutocompleteElement (client-only, runs after mounted=true) ────
  // Depends on `mounted` so it re-runs once the containerRef div is in the DOM.
  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    ensureStyles();
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function mount(): Promise<void> {
      let PAE = window.google?.maps?.places?.PlaceAutocompleteElement;

      if (!PAE && window.google?.maps?.importLibrary) {
        try {
          const lib = await window.google.maps.importLibrary("places");
          PAE = lib.PlaceAutocompleteElement as typeof PAE;
        } catch (err) {
          console.warn("[AddressAutocomplete] importLibrary failed:", err);
          return;
        }
      }

      if (!PAE || destroyed) return;
      console.log("[AddressAutocomplete] mounting PlaceAutocompleteElement");

      const el = new PAE({
        componentRestrictions: { country: "au" },
      });

      el.setAttribute("placeholder", placeholder);
      el.value = value;
      if (hasError) el.setAttribute("data-error", "true");

      elementRef.current = el;
      container!.appendChild(el);

      // ── gmp-placeselect ────────────────────────────────────────────────────
      const handleSelect = async (e: GmpPlaceSelectEvent) => {
        console.log("[AddressAutocomplete] gmp-placeselect event fired");
        try {
          const eventPlace = e.place;

          // Use the place returned by fetchFields — some implementations don't
          // mutate the event's place object in-place.
          const result = await eventPlace.fetchFields({
            fields: ["addressComponents", "formattedAddress"],
          });
          const place = result.place ?? eventPlace;

          console.log("[AddressAutocomplete] raw addressComponents:", place.addressComponents);
          console.log("[AddressAutocomplete] formattedAddress:", place.formattedAddress);

          const components = place.addressComponents ?? [];

          const get = (type: string, short = false): string => {
            const c = components.find((comp) => comp.types.includes(type));
            return c ? (short ? c.shortText : c.longText) : "";
          };

          const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
          const suburb = get("locality") || get("sublocality_level_1") || get("sublocality");
          const state = get("administrative_area_level_1", true); // shortText → SA, VIC, etc.
          const postcode = get("postal_code");
          const full_address =
            place.formattedAddress ??
            [street, suburb, state, postcode].filter(Boolean).join(", ");

          console.log("[AddressAutocomplete] parsed →", { street, suburb, state, postcode, full_address });

          // Update the street field value
          if (street) onChangeRef.current(street);

          // Fire onSelect with all parsed fields — parent is responsible for
          // setting suburb / state / postcode in form state.
          console.log("[AddressAutocomplete] calling onSelect with:", { full_address, street, suburb, state, postcode });
          onSelectRef.current({ full_address, street, suburb, state, postcode });
        } catch (err) {
          console.error("[AddressAutocomplete] fetchFields error:", err);
        }
      };

      el.addEventListener("gmp-placeselect", handleSelect);

      // Forward blur from the inner input for saveOnBlur in drawers
      el.addEventListener("blur", (e: Event) => {
        const target = e.target as HTMLInputElement | null;
        onBlurRef.current?.(target?.value ?? el.value);
      }, true); // capture so inner input blur is caught
    }

    function tryMount() {
      if (window.google?.maps) {
        mount();
      } else {
        intervalId = setInterval(() => {
          if (window.google?.maps) {
            clearInterval(intervalId!);
            intervalId = null;
            mount();
          }
        }, 300);
      }
    }

    tryMount();

    return () => {
      destroyed = true;
      if (intervalId) clearInterval(intervalId);
      const el = elementRef.current;
      if (el && container.contains(el)) container.removeChild(el);
      elementRef.current = null;
    };
  }, [mounted]); // re-runs when mounted flips true so containerRef is available

  // ── Manual entry helpers ──────────────────────────────────────────────────────

  function switchToManual() {
    const seeded = { street: value, suburb: "", state: "", postcode: "" };
    setManual(seeded);
    setManualMode(true);
  }

  function switchToSearch() {
    setManualMode(false);
    requestAnimationFrame(() => {
      const el = elementRef.current;
      if (el) el.value = manual.street;
    });
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

  // ── Render ────────────────────────────────────────────────────────────────────
  //
  // Server render + initial client render (before useEffect): show a visual
  // placeholder that matches the component's unloaded appearance so React
  // hydrates without a mismatch, then the real UI appears after mount.

  return (
    <div style={{ width: "100%", ...style }}>
      {mounted ? (
        <>
          {/* Autocomplete container — always in DOM so the gmp element survives mode toggle */}
          <div
            ref={containerRef}
            style={{ display: manualMode ? "none" : "block" }}
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
                style={manualInputStyle}
                autoComplete="off"
              />
              <input
                type="text"
                placeholder="Suburb"
                value={manual.suburb}
                onChange={(e) => updateManual("suburb", e.target.value)}
                style={manualInputStyle}
                autoComplete="off"
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <input
                  type="text"
                  placeholder="State (e.g. SA)"
                  value={manual.state}
                  onChange={(e) => updateManual("state", e.target.value)}
                  style={manualInputStyle}
                  autoComplete="off"
                />
                <input
                  type="text"
                  placeholder="Postcode"
                  value={manual.postcode}
                  onChange={(e) => updateManual("postcode", e.target.value)}
                  style={manualInputStyle}
                  autoComplete="off"
                />
              </div>
            </div>
          )}
        </>
      ) : (
        // SSR / pre-hydration placeholder — same visual shape, no gmp element
        <div style={{
          height: 40,
          border: "1px solid #E8E8F0",
          borderRadius: 8,
          background: "#fff",
        }} />
      )}

      {/* Toggle link — rendered on both server and client for consistent hydration */}
      <div style={{ marginTop: 4 }}>
        <button
          type="button"
          onClick={mounted ? (manualMode ? switchToSearch : switchToManual) : undefined}
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
