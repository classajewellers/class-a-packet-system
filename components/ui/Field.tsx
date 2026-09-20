"use client";

import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, forwardRef } from "react";

interface FieldWrapperProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

/**
 * Vault design system v1 field wrapper - label, control, hint/error text.
 * Replaces the old pattern of a large coloured section-header bar followed
 * by loosely-related inputs: a plain label + hairline divider between
 * sections carries the same information with far less visual noise.
 */
export function Field({ label, hint, error, required, children }: FieldWrapperProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <label className="vault-label">
          {label}
          {required && <span style={{ color: "var(--vault-status-error)" }}> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <div style={{ fontSize: 12, color: "var(--vault-status-error)", marginTop: 4 }}>{error}</div>
      ) : hint ? (
        <div style={{ fontSize: 12, color: "var(--vault-text-muted)", marginTop: 4 }}>{hint}</div>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { hasError, className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={["vault-input", hasError ? "vault-input-error" : "", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { hasError, className, children, ...rest },
  ref
) {
  return (
    <select
      ref={ref}
      className={["vault-input", hasError ? "vault-input-error" : "", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </select>
  );
});

export default Field;
