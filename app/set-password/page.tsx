'use client'

import { useEffect, useState } from 'react'
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

export default function SetPasswordPage() {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [ready, setReady]         = useState(false)
  const [sessionError, setSessionError] = useState(false)

  useEffect(() => {
    // Parse the access_token from the URL hash set by Supabase invite link
    const hash = window.location.hash
    const params = new URLSearchParams(hash.replace('#', ''))
    const accessToken  = params.get('access_token')
    const refreshToken = params.get('refresh_token') ?? ''
    const type         = params.get('type')

    if (accessToken && type === 'invite') {
      getSupabase().auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) { setSessionError(true) } else { setReady(true) }
        })
    } else {
      // Check if already have a session (e.g. page refresh)
      getSupabase().auth.getSession().then(({ data }) => {
        if (data.session) { setReady(true) } else { setSessionError(true) }
      })
    }
  }, [])

  async function handleSubmit() {
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    const { error: updateErr } = await getSupabase().auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      return
    }
    window.location.href = '/'
  }

  if (sessionError) {
    return (
      <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{
