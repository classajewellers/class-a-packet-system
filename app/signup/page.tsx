'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'

export default function SignupPage() {
  const [step, setStep] = useState(1)
  const [storeName, setStoreName] = useState('')
  const [slug, setSlug] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function generateSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleSignup() {
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeName, slug, fullName, email, password })
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Something went wrong')
      setLoading(false)
      return
    }

    // Sign in with the new credentials
    const { createBrowserClient } = await import('@supabase/ssr')
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    window.location.href = '/onboarding'
  }

  const cardStyle = { background: 'white', border: '1px solid #E8E8F0', borderRadius: 12, padding: 48, width: 440 }
  const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #E8E8F0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, marginBottom: 16 }
  const labelStyle = { display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }
  const btnStyle = { width: '100%', padding: 12, background: '#635BFF', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 8 }

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, background: '#635BFF', borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <span style={{ color: 'white', fontSize: 20 }}>◆</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1760', margin: '0 0 8px' }}>Start your free trial</h1>
          <p style={{ color: '#6B7280', fontSize: 14, margin: 0 }}>Step {step} of 2</p>
        </div>

        {step === 1 && (
          <>
            <div>
              <label style={labelStyle}>Store Name</label>
              <input
                type="text"
                value={storeName}
                onChange={e => {
                  setStoreName(e.target.value)
                  setSlug(generateSlug(e.target.value))
                }}
                placeholder="Adelaide Diamond Gallery"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Store URL</label>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E8E8F0', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                <span style={{ padding: '10px 12px', background: '#F9FAFB', color: '#6B7280', fontSize: 13, whiteSpace: 'nowrap' as const }}>jewelleryvault.com.au/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={e => setSlug(e.target.value)}
                  style={{ flex: 1, padding: '10px 12px', border: 'none', fontSize: 14, outline: 'none' }}
                />
              </div>
            </div>
            <button
              onClick={() => {
                if (!storeName || !slug) { setError('Please fill in all fields'); return }
                setError('')
                setStep(2)
              }}
              style={btnStyle}
            >
              Continue →
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <label style={labelStyle}>Your Full Name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Sarah Johnson" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="sarah@yourstore.com.au" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" style={inputStyle} />
            </div>
            <button onClick={handleSignup} style={btnStyle}>
              {loading ? 'Creating your store...' : 'Create my store'}
            </button>
            <button onClick={() => setStep(1)} style={{ ...btnStyle, background: 'white', color: '#635BFF', border: '1px solid #E8E8F0', marginTop: 8 }}>
              ← Back
            </button>
          </>
        )}

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 12, marginTop: 16, color: '#DC2626', fontSize: 14 }}>
            {error}
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: '#6B7280' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: '#635BFF', fontWeight: 500 }}>Sign in</a>
        </p>
      </div>
    </div>
  )
}
