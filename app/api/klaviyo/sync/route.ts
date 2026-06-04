import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  if (!apiKey) {
    console.error("[klaviyo/sync] KLAVIYO_PRIVATE_API_KEY not configured");
    return NextResponse.json({ error: "Klaviyo API key not configured" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    customer_email,
    customer_phone,
    customer_first_name,
    customer_last_name,
    product_category,
    total_charges,
    reference_number,
    collected_date,
    staff_member,
  } = body;

  const headers: Record<string, string> = {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    revision: "2023-12-15",
    "Content-Type": "application/json",
  };

  // ── Call 1: Create / update profile ──────────────────────────────────────────
  const profilePayload = {
    data: {
      type: "profile",
      attributes: {
        email: customer_email,
        phone_number: customer_phone,
        first_name: customer_first_name,
        last_name: customer_last_name,
        properties: {
          product_category,
          last_order_value: total_charges,
          last_order_reference: reference_number,
          last_order_date: collected_date,
          staff_member,
        },
      },
    },
  };

  const profileRes = await fetch("https://a.klaviyo.com/api/profiles/", {
    method: "POST",
    headers,
    body: JSON.stringify(profilePayload),
  });

  // 201 = created, 200 = updated, 409 = duplicate profile (treat as success — profile exists)
  if (!profileRes.ok && profileRes.status !== 409) {
    const errText = await profileRes.text();
    console.error("[klaviyo/sync] Profile upsert failed:", profileRes.status, errText);
    return NextResponse.json(
      { error: `Klaviyo profile sync failed (${profileRes.status})` },
      { status: 502 }
    );
  }

  console.log("[klaviyo/sync] Profile upserted:", profileRes.status, customer_email);

  // ── Call 2: Track In-Store Collection event ───────────────────────────────────
  const eventPayload = {
    data: {
      type: "event",
      attributes: {
        metric: {
          data: {
            type: "metric",
            attributes: { name: "In-Store Collection" },
          },
        },
        profile: {
          data: {
            type: "profile",
            attributes: { email: customer_email },
          },
        },
        properties: {
          product_category,
          order_reference: reference_number,
          order_value: total_charges,
          staff_member,
          collected_date,
        },
      },
    },
  };

  const eventRes = await fetch("https://a.klaviyo.com/api/events/", {
    method: "POST",
    headers,
    body: JSON.stringify(eventPayload),
  });

  if (!eventRes.ok) {
    const errText = await eventRes.text();
    console.error("[klaviyo/sync] Event tracking failed:", eventRes.status, errText);
    return NextResponse.json(
      { error: `Klaviyo event tracking failed (${eventRes.status})` },
      { status: 502 }
    );
  }

  console.log("[klaviyo/sync] Event tracked:", reference_number, product_category);

  return NextResponse.json({ success: true });
}
