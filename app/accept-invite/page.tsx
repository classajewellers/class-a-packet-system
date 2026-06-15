'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function getParam(name: string): string | null {
  // Check query string first, then hash (Supabase uses both depending on flow)
  const search = new URLSearchParams(window.location.search)
  if (search.get(name)) return search.get(name)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return hash.get(name)
}

export default function AcceptInvitePage() {
  const [status, setStatus] = useState<'verifying' | 'ready' | 'error'>('verifying')
  const [tokenError, setTokenError] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function verify() {
      const tokenHash = getParam('token_hash')
      const type = getParam('type')

      if (!tokenHash) {
        setTokenError('This invite link has expired. Ask your manager to resend the invite.')
        setStatus('error')
        return
      }

      const supabase = getSupabase()
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: (type as 'invite') ?? 'invite',
      })

      if (error) {
        setTokenError('This invite link has expired. Ask your manager to resend the invite.')
        setStatus('error')
        return
      }

      setStatus('ready')
    }

    verify()
  }, [])

  async function handleSubmit() {
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    const supabase = getSupabase()
    const { error: updateErr } = await supabase.auth.updateUser({ password })

    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      return
    }

    window.location.href = '/'
  }

  const input: React.CSSProperties = {
    width: '100%', padding: '10px 14px', border: '1px solid #E8E8F0',
    borderRadius: 8, fontSize: 14, boxSizing: 'border-box', marginTop: 6,
  }

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

        {status === 'verifying' && (
          <p style={{ textAlign: 'center', color: '#6B7280', fontSize: 14 }}>Verifying invite link…</p>
        )}

        {status === 'error' && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 16, color: '#DC2626', fontSize: 14, textAlign: 'center' }}>
            {tokenError}
          </div>
        )}

        {status === 'ready' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={input} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && handleSubmit()} style={input} />
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
