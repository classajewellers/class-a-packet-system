"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onChange: (next: boolean) => void;
}

/**
 * Vault design system v1 toggle — standard iOS/macOS-style switch (pill
 * track, sliding circular knob). See app/globals.css (.vault-toggle) for
 * the visual rules. Controlled component: the caller owns the checked
 * state and is responsible for persisting it (e.g. via PATCH) in onChange.
 */
export const Toggle = forwardRef<HTMLButtonElement, Props>(function Toggle(
  { checked, onChange, className, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-checked={checked}
      onClick={() => onChange(!checked)}
      className={["vault-toggle", className].filter(Boolean).join(" ")}
      {...rest}
    >
      <span className="vault-toggle-knob" />
    </button>
  );
});

export default Toggle;
