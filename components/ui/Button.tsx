"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive" | "icon";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "vault-btn vault-btn-primary",
  secondary: "vault-btn vault-btn-secondary",
  tertiary: "vault-btn vault-btn-tertiary",
  destructive: "vault-btn vault-btn-destructive",
  icon: "vault-btn vault-btn-icon",
};

/**
 * Vault design system v1 button. One consistent hierarchy across the app -
 * see app/globals.css (.vault-btn-*) for the actual visual rules.
 * Primary = dark/white text. Secondary = hairline border. Tertiary = text
 * only. Destructive = red only for genuinely destructive actions.
 */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", loading, disabled, children, className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={[VARIANT_CLASS[variant], className].filter(Boolean).join(" ")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? "…" : children}
    </button>
  );
});

export default Button;
