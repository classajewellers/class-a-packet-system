import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateQuoteReferenceNumber } from '@/lib/referenceNumber'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      firstName, lastName, email, phone, assignedTo,
      quoteDescription, internalNotes,
      quotedPrice,
      quoteBuilderData, quoteType,
      jobType, jobDescription,
    } = body

    const referenceNumber = await generateQuoteReferenceNumber()
    const now = new Date().toISOString()

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('quotes')
      .insert({
        reference_number: referenceNumber,
        quote_type: quoteType ?? 'custom_order',
        status: 'pending',
        customer_first_name: firstName || null,
        customer_last_name: lastName || null,
        customer_email: email || null,
        customer_phone: phone || null,
        notes: internalNotes || null,
        design_brief: quoteDescription || null,
        assigned_to: assignedTo || null,
        staff_member: assignedTo || null,
        quoted_price: quotedPrice ?? null,
        total: quotedPrice ?? null,
        quote_builder_data: quoteBuilderData ?? null,
        job_type: jobType || null,
        job_description: jobDescription || null,
        pending_at: now,
        status_changed_at: now,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Upsert customer
    if (email) {
      void supabase.from('customers').upsert(
        { email: email.toLowerCase().trim(), phone: phone || null, first_name: firstName || null, last_name: lastName || null, last_visit_date: new Date().toISOString().split('T')[0] },
        { onConflict: 'email' }
      )
    }

    return NextResponse.json({ quote: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
