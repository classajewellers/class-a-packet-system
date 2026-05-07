import { NextRequest, NextResponse } from "next/server";
import { lookupShopifyCustomerByEmail } from "@/lib/shopify";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const email = req.nextUrl.searchParams.get("email")?.trim() ?? "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ customer: null });
  }

  try {
    const customer = await lookupShopifyCustomerByEmail(email);
    return NextResponse.json({ customer });
  } catch {
    return NextResponse.json({ customer: null });
  }
}
