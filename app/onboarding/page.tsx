'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/context/UserContext'

export const dynamic = 'force-dynamic'

const inputStyle: React.CSSProperties = {
  padding: '10px 14px',
  border: '1px solid #E8E8F0',
  borderRadius: '8px',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'Inter, system-ui, sans-serif',
  color: '#111827',
  background: '#fff',
  boxSizing: 'border-box',
}

export default function OnboardingPage() {
  const router       = useRouter()
  const { user }     = useUser()

  const [step, setStep]             = useState(1)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'staff' | 'manager'>('staff')
  const [inviting, setInviting]     = useState(false)
  const [invitesSent, setInvitesSent] = useState<string[]>([])
  const [inviteError, setInviteError] = useState<string | null>(null)

  const storeName = user?.name ?? 'your store'
  const tenantId  = user?.tenantId ?? ''

  const sendInvite = async () => {
    setInviteError(null)
    if (!inviteEmail.trim()) { setInviteError('Enter an email address'); return }
    setInviting(true)
    try {
      const res = await fetch('/api/settings/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
        body: JSON.stringify({ name: inviteEmail.split('@')[0], email: inviteEmail, role: inviteRole }),
      })
      const json = await res.json()
      if (!res.ok) { setInviteError(json.error ?? 'Failed to send invite'); return }
      setInvitesSent(prev => [...prev, inviteEmail])
      setInviteEmail('')
    } catch (err) {
      setInviteError(String(err))
    } finally {
      setInviting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif', padding: '24px' }}>
      <div style={{ background: 'white', border: '1px solid #E8E8F0', borderRadius: '12px', padding: '48px', width: '100%', maxWidth: '480px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '48px', height: '48px', background: '#635BFF', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'white', fontSize: '24px' }}>◆</span>
          </div>

          {/* Step indicator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', marginTop: '16px' }}>
            {[1, 2, 3].map((s) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: '600',
                  background: step > s ? '#10B981' : step === s ? '#635BFF' : '#F3F4F6',
                  color: step >= s ? 'white' : '#9CA3AF',
                  zIndex: 1, position: 'relative',
                }}>
                  {step > s ? '✓' : s}
                </div>
                {s < 3 && (
                  <div style={{ width: '48px', height: '2px', background: step > s ? '#10B981' : '#E8E8F0' }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Step 1: Welcome ── */}
        {step === 1 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>👋</div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1760', marginBottom: '12px' }}>
              Welcome to Vault{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!
            </h1>
            <p style={{ color: '#6B7280', fontSize: '15px', lineHeight: '1.6', marginBottom: '8px' }}>
              Your store is ready.
            </p>
            <p style={{ color: '#6B7280', fontSize: '14px', lineHeight: '1.6', marginBottom: '32px' }}>
              Let's get you set up in 2 minutes.
            </p>
            <button
              onClick={() => setStep(2)}
              style={{ width: '100%', padding: '13px', background: '#635BFF', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}
            >
              Get started →
            </button>
          </div>
        )}

        {/* ── Step 2: Invite team ── */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1A1760', marginBottom: '6px', textAlign: 'center' }}>Invite your staff</h2>
            <p style={{ color: '#6B7280', fontSize: '13px', textAlign: 'center', marginBottom: '24px' }}>
              Add team members now or skip and do it later in Settings.
            </p>

            {inviteError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', color: '#DC2626', fontSize: '13px' }}>
                {inviteError}
              </div>
            )}

            {invitesSent.length > 0 && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
                {invitesSent.map((e) => (
                  <div key={e} style={{ fontSize: '13px', color: '#15803D', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>✓</span> Invite sent to {e}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendInvite() }}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="colleague@example.com"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'staff' | 'manager')}
                style={{ ...inputStyle, width: '110px', cursor: 'pointer' }}
              >
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
            </div>

            <button
              onClick={sendInvite}
              disabled={inviting}
              style={{ width: '100%', padding: '11px', background: inviting ? '#9CA3AF' : '#635BFF', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: inviting ? 'not-allowed' : 'pointer', marginBottom: '16px' }}
            >
              {inviting ? 'Sending...' : 'Send invite'}
            </button>

            <button
              onClick={() => setStep(3)}
              style={{ width: '100%', background: 'none', border: 'none', color: '#9CA3AF', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', padding: '4px' }}
            >
              Skip for now
            </button>
          </div>
        )}

        {/* ── Step 3: Ready ── */}
        {step === 3 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', background: '#F0FDF4', border: '2px solid #10B981', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', marginBottom: '20px' }}>
              ✓
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1760', marginBottom: '10px' }}>
              You're all set!
            </h2>
            <p style={{ color: '#6B7280', fontSize: '14px', lineHeight: '1.6', marginBottom: '28px' }}>
              Your store is set up and ready to go.
            </p>

            <div style={{ background: '#FEFCE8', border: '1px solid #FDE68A', borderRadius: '10px', padding: '14px 18px', marginBottom: '28px', textAlign: 'left' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#92400E', marginBottom: '3px' }}>⏱ 14-day free trial</div>
              <div style={{ fontSize: '13px', color: '#78350F' }}>No credit card required. Explore everything Vault has to offer.</div>
            </div>

            <button
              onClick={() => router.push('/orders')}
              style={{ width: '100%', padding: '13px', background: '#635BFF', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}
            >
              Go to Vault →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
