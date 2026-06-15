import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (token_hash && type === 'invite') {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'invite' })
    if (!error) {
      return NextResponse.redirect(new URL('/set-password', request.url))
    }
  }

  return NextResponse.redirect(new URL('/login?error=invalid_invite', request.url))
}
