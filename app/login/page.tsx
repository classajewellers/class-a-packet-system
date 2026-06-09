'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Bug 1 fix: always reset stale loading state on mount
  useEffect(() => {
    setLoading(false)
  }, [])

  const handleSignIn = async () => {
    setLoading(true)
    setError(null)

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.session) {
      // Allow session cookie to be set before navigating
      await new Promise(resolve => setTimeout(resolve, 500))
      router.push('/orders')
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', border: '1px solid #E8E8F0', borderRadius: '12px', padding: '48px', width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '48px', height: '48px', background: '#635BFF', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
            <span style={{ color: 'white', fontSize: '24px' }}>◆</span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1A1760', marginBottom: '8px' }}>Sign in to Vault</h1>
          <p style={{ color: '#6B7280', fontSize: '14px' }}>Enter your email and password to continue</p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', border: '1px solid #E8E8F0', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            placeholder="you@example.com"
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', border: '1px solid #E8E8F0', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#DC2626', fontSize: '14px' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={loading}
          style={{ width: '100%', padding: '12px', background: loading ? '#9CA3AF' : '#635BFF', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: '#9CA3AF' }}>
          Access issues? Contact your administrator.
        </p>
      </div>
    </div>
  )
}
