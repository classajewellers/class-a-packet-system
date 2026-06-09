'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  border: '1px solid #E8E8F0',
  borderRadius: '8px',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'Inter, system-ui, sans-serif',
  color: '#111827',
  background: '#fff',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: '500',
  color: '#374151',
  marginBottom: '6px',
}

export default function SignupPage() {
  const router = useRouter()

  const [step, setStep]           = useState(1)
  const [storeName, setStoreName] = useState('')
  const [slug, setSlug]           = useState('')
  const [fullName, setFullName]   = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [phone, setPhone]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const handleStoreNameChange = (value: string) => {
    setStoreName(value)
    setSlug(slugify(value))
  }

  const handleStep1Continue = () => {
    setError(null)
    if (!storeName.trim()) { setError('Store name is required'); return }
    if (!slug.trim())      { setError('Store URL is required'); return }
    if (!/^[a-z0-9-]+$/.test(slug)) { setError('Store URL can only contain lowercase letters, numbers, and hyphens'); return }
    setStep(2)
  }

  const handleCreateStore = async () => {
    setError(null)
    if (!fullName.trim()) { setError('Full name is required'); return }
    if (!email.trim())    { setError('Email is required'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeName, slug, fullName, email, password, phone }),
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error ?? 'Something went wrong. Please try again.')
        return
      }

      // Sign in with the new credentials
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

      if (signInError) {
        setError('Account created! Please sign in at /login.')
        return
      }

      await new Promise(resolve => setTimeout(resolve, 500))
      router.push('/onboarding')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif', padding: '24px' }}>
      <div style={{ background: 'white', border: '1px solid #E8E8F0', borderRadius: '12px', padding: '48px', width: '100%', maxWidth: '440px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ width: '48px', height: '48px', background: '#635BFF', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
            <span style={{ color: 'white', fontSize: '24px' }}>◆</span>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1760', marginBottom: '4px' }}>Start your free trial</h1>
          <p style={{ color: '#6B7280', fontSize: '13px', margin: 0 }}>14 days free. No credit card required.</p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '28px' }}>
          {[1, 2].map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: '600',
                background: step >= s ? '#635BFF' : '#F3F4F6',
                color: step >= s ? 'white' : '#9CA3AF',
              }}>
                {step > s ? '✓' : s}
              </div>
              <span style={{ fontSize: '12px', color: step === s ? '#635BFF' : '#9CA3AF', fontWeight: step === s ? '600' : '400' }}>
                {s === 1 ? 'Store details' : 'Your account'}
              </span>
              {s < 2 && <div style={{ width: '32px', height: '1px', background: step > s ? '#635BFF' : '#E8E8F0' }} />}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px', marginBottom: '20px', color: '#DC2626', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {/* ── Step 1: Store details ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Store Name <span style={{ color: '#EF4444' }}>*</span></label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => handleStoreNameChange(e.target.value)}
                style={inputStyle}
                placeholder="e.g. Sunrise Jewellers"
                autoFocus
              />
            </div>

            <div>
              <label style={labelStyle}>Store URL <span style={{ color: '#EF4444' }}>*</span></label>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E8E8F0', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                <span style={{ padding: '10px 10px 10px 14px', fontSize: '13px', color: '#9CA3AF', whiteSpace: 'nowrap', background: '#F9FAFB', borderRight: '1px solid #E8E8F0' }}>
                  vault.com.au/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  style={{ ...inputStyle, border: 'none', borderRadius: '0', flex: 1, paddingLeft: '10px' }}
                  placeholder="your-store"
                />
              </div>
              {slug && (
                <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '6px' }}>
                  Your store URL: <strong>jewelleryvault.com.au/{slug}</strong>
                </p>
              )}
            </div>

            <button
              onClick={handleStep1Continue}
              style={{ width: '100%', padding: '12px', background: '#635BFF', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginTop: '4px' }}
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── Step 2: Account details ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Full Name <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} placeholder="Jane Smith" autoFocus />
            </div>

            <div>
              <label style={labelStyle}>Email <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="jane@example.com" />
            </div>

            <div>
              <label style={labelStyle}>Password <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} placeholder="Min. 8 characters" />
            </div>

            <div>
              <label style={{ ...labelStyle, color: '#6B7280' }}>Phone <span style={{ fontSize: '12px', fontWeight: '400' }}>(optional)</span></label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="+61 4XX XXX XXX" />
            </div>

            <button
              onClick={handleCreateStore}
              disabled={loading}
              style={{ width: '100%', padding: '12px', background: loading ? '#9CA3AF' : '#635BFF', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '4px' }}
            >
              {loading ? 'Creating your store...' : 'Create my store'}
            </button>

            <button
              onClick={() => { setStep(1); setError(null) }}
              style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >
              ← Back
            </button>
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: '#9CA3AF' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#635BFF', textDecoration: 'none', fontWeight: '500' }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
