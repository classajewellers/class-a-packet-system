'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'

export default function AcceptInvitePage() {
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [sessionError, setSessionError] = useState('')

  // On mount, exchange the token from the URL fragment for a session.
  // Supabase appends #access_token=...&type=invite (or ?token_hash=...) to the
  // redirectTo URL. We need to establish the session before updateUser() will work.
  //
  // NOTE: Add https://www.jewelleryvault.com.au/accept-invite to the Supabase
  // redirect allowlist: Dashboard → Authentication → URL Configuration → Redirect URLs
  useEffect(() => {
    async function establish() {
      const { createBrowserClient } = await import('@supabase/ssr')
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      // Let the Supabase client pick up the hash / query params automatically.
      const { data, error: sessErr } = await supabase.auth.getSession()

      if (sessErr || !data.session) {
        setSessionError('This invite link has expired. Please ask your manager to resend the invite.')
        return
      }

      // Pre-fill full name from invite metadata if available.
      const meta = data.session.user.user_metadata
      if (meta?.full_name) setFullName(meta.full_name as string)

      setSessionReady(true)
    }

    establish()
  }, [])

  async function handleSubmit() {
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { createBrowserClient } = await import('@supabase/ssr')
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const updates: { password: string; data?: { full_name: string } } = { password }
    if (fullName.trim()) updates.data = { full_name: fullName.trim() }

    const { error: updateErr } = await supabase.auth.updateUser(updates)

    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      return
    }

    window.location.href = '/'
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #E8E8F0',
    borderRadius: 8,
    fontSize: 14,
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 6,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: 'white', border: '1px solid #E8E8F0', borderRadius: 12, padding: 48, width: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, background: '#635BFF', borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <span style={{ color: 'white', fontSize: 20 }}>◆</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1760', margin: '0 0 8px' }}>Welcome to Vault</h1>
          <p style={{ color: '#6B7280', fontSize: 14, margin: 0 }}>You've been invited to Vault. Set your password to get started.</p>
        </div>

        {sessionError ? (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 16, color: '#DC2626', fontSize: 14, textAlign: 'center' }}>
            {sessionError}
          </div>
        ) : !sessionReady ? (
          <div style={{ textAlign: 'center', color: '#6B7280', fontSize: 14, padding: '16px 0' }}>
            Verifying invite link…
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Jane Smith"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 12, marginBottom: 16, color: '#DC2626', fontSize: 14 }}>
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{ width: '100%', padding: 12, background: '#635BFF', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Setting up your account…' : 'Set Password & Sign In'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
