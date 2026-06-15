import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Nivoda integration pending — awaiting correct API credentials from Nivoda support.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Nivoda integration pending configuration" },
    { status: 503 }
  );
}
