'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', border: '1px solid #E8E8F0',
  borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6,
}

export default function LoginPage() {
  // Invite flow state
  const [inviteMode, setInviteMode] = useState<'ready' | 'error' | null>(null)
  const [inviteTokenHash, setInviteTokenHash] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteFormError, setInviteFormError] = useState('')

  // Login flow state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Check both hash and query string for an invite token
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const searchParams = new URLSearchParams(window.location.search)

    const tokenHash = hashParams.get('token_hash') ?? searchParams.get('token_hash')
    const type = hashParams.get('type') ?? searchParams.get('type')

    if (!tokenHash || type !== 'invite') return

    // Store the token and show the form — do NOT exchange the token yet
    setInviteTokenHash(tokenHash)
    setInviteMode('ready')
  }, [])

  async function handleSetPassword() {
    setInviteFormError('')
    if (newPassword.length < 8) { setInviteFormError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setInviteFormError('Passwords do not match.'); return }

    setInviteLoading(true)
    const supabase = getSupabase()

    // Exchange the invite token for a session first
    const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: inviteTokenHash, type: 'invite' })
    if (otpError) {
      setInviteFormError('This invite link has expired. Ask your manager to resend the invite.')
      setInviteLoading(false)
      return
    }

    // Immediately set the password while the session is fresh
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setInviteFormError(updateError.message)
      setInviteLoading(false)
      return
    }

    window.location.href = '/'
  }

  async function handleLogin() {
    setLoading(true)
    setError('')
    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    window.location.href = '/orders'
  }

  // ── Invite mode ──────────────────────────────────────────────────────────────
  if (inviteMode !== null) {
    return (
      <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: 'white', border: '1px solid #E8E8F0', borderRadius: 12, padding: 48, width: 400 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 48, height: 48, background: '#635BFF', borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <span style={{ color: 'white', fontSize: 20 }}>◆</span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1760', margin: '0 0 8px' }}>Welcome to Vault</h1>
            <p style={{ color: '#6B7280', fontSize: 14, margin: 0 }}>Set your password to get started.</p>
          </div>

          {inviteMode === 'error' && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 16, color: '#DC2626', fontSize: 14, textAlign: 'center' }}>
              {inviteError}
            </div>
          )}

          {inviteMode === 'ready' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && handleSetPassword()} style={inputStyle} />
              </div>
              {inviteFormError && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 12, marginBottom: 16, color: '#DC2626', fontSize: 14 }}>
                  {inviteFormError}
                </div>
              )}
              <button
                onClick={handleSetPassword}
                disabled={inviteLoading}
                style={{ width: '100%', padding: 12, background: '#635BFF', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: inviteLoading ? 'wait' : 'pointer', opacity: inviteLoading ? 0.7 : 1 }}
              >
                {inviteLoading ? 'Setting up your account…' : 'Set Password & Sign In'}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Normal login ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: 'white', border: '1px solid #E8E8F0', borderRadius: 12, padding: 48, width: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, background: '#635BFF', borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <span style={{ color: 'white', fontSize: 20 }}>◆</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1760', margin: '0 0 8px' }}>Sign in to Vault</h1>
          <p style={{ color: '#6B7280', fontSize: 14, margin: 0 }}>Enter your email and password</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && handleLogin()} style={inputStyle} />
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 12, marginBottom: 16, color: '#DC2626', fontSize: 14 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          style={{ width: '100%', padding: 12, background: '#635BFF', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: '#6B7280' }}>
          New to Vault?{' '}
          <a href="/signup" style={{ color: '#635BFF', fontWeight: 500 }}>Start your free trial →</a>
        </p>
      </div>
    </div>
  )
}
