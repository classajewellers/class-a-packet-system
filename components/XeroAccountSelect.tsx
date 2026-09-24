"use client";

import { useId, type CSSProperties } from "react";
import type { XeroAccountOption, XeroAccountsLoad } from "@/lib/xeroAccounts";

export function XeroAccountSelect({
  load,
  accountId,
  accountCode,
  accountName,
  onChange,
  style,
}: {
  load: XeroAccountsLoad;
  accountId: string;
  accountCode: string;
  accountName: string;
  onChange: (account: XeroAccountOption | null) => void;
  style: CSSProperties;
}) {
  const hintId = useId();
  const accounts = load.status === "ready" ? load.accounts : [];
  const known = accounts.some(account => account.id === accountId);
  const unavailable = load.status === "unavailable";
  const none = load.status === "ready" && accounts.length === 0;
  const placeholder = load.status === "loading"
    ? "Loading accounts…"
    : load.status === "unavailable"
      ? "Accounts unavailable"
      : accounts.length === 0
        ? "No expense accounts"
        : "—";

  return (
    <div>
      <select
        value={accountId}
        aria-invalid={unavailable || undefined}
        aria-describedby={unavailable || none ? hintId : undefined}
        onChange={e => {
          const id = e.target.value;
          if (!id) {
            onChange(null);
            return;
          }
          const picked = accounts.find(account => account.id === id);
          if (picked) {
            onChange(picked);
            return;
          }
          if (id === accountId) {
            onChange({ id, code: accountCode, name: accountName });
            return;
          }
          onChange(null);
        }}
        style={style}
      >
        <option value="">{placeholder}</option>
        {accountId && !known && (
          <option value={accountId}>
            {accountCode ? `${accountCode} — ${accountName || "Saved account"}` : (accountName || "Saved account")}
          </option>
        )}
        {accounts.map(account => (
          <option key={account.id} value={account.id}>
            {account.code ? `${account.code} — ${account.name}` : account.name}
          </option>
        ))}
      </select>
      {unavailable && (
        <p id={hintId} style={{ fontSize: 12, color: "#B45309", margin: "4px 0 0", lineHeight: 1.4 }}>{load.message}</p>
      )}
      {none && (
        <p id={hintId} style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0", lineHeight: 1.4 }}>
          Xero is connected, but it has no active expense or direct-cost accounts.
        </p>
      )}
    </div>
  );
}
