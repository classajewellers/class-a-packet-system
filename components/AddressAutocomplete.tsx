"use client";

// SETUP: Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to Vercel environment variables.
// Dashboard → Settings → Environment Variables → add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
// The Maps script is loaded globally in app/layout.tsx.

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
  hasError?: boolean;
  /** Pass only layout-level styles (e.g. width, margin). Visual styling is handled by injected CSS. */
  style?: React.CSSProperties;
}

// ── Type stubs for the new Places API ─────────────────────────────────────

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

// ── Global CSS injection (once per page) ──────────────────────────────────
// Styles the inner <input> via CSS shadow parts and direct element rules.

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
    /* Style the input via shadow parts (Chrome 73+, Firefox 72+, Safari 13.1+) */
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
    /* Error state — toggled via data-error attribute on the element */
    gmp-placeautocomplete[data-error]::part(input) {
      border-color: #EF4444;
      background: #FEF2F2;
    }
    /* Tailwind-context variant (form pages) */
    gmp-placeautocomplete::part(input) {
      /* already covered above */
    }
  `;
  document.head.appendChild(s);
}

// ── Component ──────────────────────────────────────────────────────────────

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

  // Keep callbacks in refs so the closure inside useEffect is always current
  const onChangeRef = useRef(onChange);
  const onSelectRef = useRef(onSelect);
  const onBlurRef = useRef(onBlur);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onBlurRef.current = onBlur; }, [onBlur]);

  // Sync controlled value into the element's input
  useEffect(() => {
    const el = elementRef.current;
    if (el && el.value !== value) el.value = value;
  }, [value]);

  // Toggle error styling on the element
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;
    if (hasError) {
      el.setAttribute("data-error", "true");
    } else {
      el.removeAttribute("data-error");
    }
  }, [hasError]);

  // Create and mount the PlaceAutocompleteElement once
  useEffect(() => {
    ensureStyles();
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;

    let destroyed = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function mount(): Promise<void> {
      // Get PlaceAutocompleteElement — try the namespace first, fall back to importLibrary
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
        types: ["address"],
      });

      // Set placeholder and initial value
      el.setAttribute("placeholder", placeholder);
      el.value = value;
      if (hasError) el.setAttribute("data-error", "true");

      elementRef.current = el;
      container!.appendChild(el);

      // ── gmp-placeselect handler ──────────────────────────────────────
      const handleSelect = async (e: GmpPlaceSelectEvent) => {
        try {
          const place = e.place;
          await place.fetchFields({ fields: ["addressComponents", "formattedAddress"] });

          const components = place.addressComponents ?? [];

          const get = (type: string, short = false): string => {
            const c = components.find((comp) => comp.types.includes(type));
            return c ? (short ? c.shortText : c.longText) : "";
          };

          const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
          const suburb = get("locality") || get("sublocality");
          const state = get("administrative_area_level_1", true);
          const postcode = get("postal_code");
          const full_address =
            place.formattedAddress ??
            [street, suburb, state, postcode].filter(Boolean).join(", ");

          if (street) onChangeRef.current(street);
          onSelectRef.current({ full_address, street, suburb, state, postcode });
        } catch (err) {
          console.error("[AddressAutocomplete] fetchFields error:", err);
        }
      };

      el.addEventListener("gmp-placeselect", handleSelect);

      // Forward blur from the element's inner input for saveOnBlur in drawers
      el.addEventListener("blur", (e: Event) => {
        const target = e.target as HTMLInputElement | null;
        onBlurRef.current?.(target?.value ?? el.value);
      }, true); // capture phase catches inner input blur
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", ...style }}
    />
  );
}
