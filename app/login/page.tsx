"use client";

export const dynamic = "force-dynamic";

import { useState, FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = createBrowserSupabaseClient();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setError("Incorrect email or password. Please try again.");
      setLoading(false);
      return;
    }

    // AuthGuard in ClientProviders detects the session and redirects to "/"
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#1A1760",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      {/* Logo mark */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "#635BFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.15em",
          color: "#FFFFFF",
          textAlign: "center",
          marginBottom: 4,
        }}
      >
        CLASS A JEWELLERS
      </div>
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.5)",
          marginBottom: 36,
          letterSpacing: "0.06em",
        }}
      >
        Order System
      </div>

      {/* Card */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 20,
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          padding: "36px 32px",
          width: "100%",
          maxWidth: 380,
        }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#1A1A2E",
            marginBottom: 6,
            textAlign: "center",
          }}
        >
          Sign in
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "#6B7280",
            textAlign: "center",
            marginBottom: 28,
          }}
        >
          Enter your work email and password
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Email */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{ fontSize: 12, fontWeight: 600, color: "#374151", letterSpacing: "0.04em" }}
              htmlFor="email"
            >
              EMAIL
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@classa.com.au"
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1.5px solid #E5E7EB",
                fontSize: 14,
                color: "#1A1A2E",
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#635BFF")}
              onBlur={(e) => (e.target.style.borderColor = "#E5E7EB")}
            />
          </div>

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{ fontSize: 12, fontWeight: 600, color: "#374151", letterSpacing: "0.04em" }}
              htmlFor="password"
            >
              PASSWORD
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1.5px solid #E5E7EB",
                fontSize: 14,
                color: "#1A1A2E",
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#635BFF")}
              onBlur={(e) => (e.target.style.borderColor = "#E5E7EB")}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: 8,
                fontSize: 13,
                color: "#DC2626",
              }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: "12px",
              borderRadius: 10,
              background: loading ? "#A5B4FC" : "#635BFF",
              border: "none",
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "background 0.15s",
              letterSpacing: "0.02em",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>

      <p
        style={{
          marginTop: 28,
          fontSize: 12,
          color: "rgba(255,255,255,0.4)",
          textAlign: "center",
        }}
      >
        Can&apos;t sign in? Contact your manager.
      </p>
    </div>
  );
}
