import { NextResponse } from "next/server";
import { activeCardProvider } from "@/lib/payments";

export const dynamic = "force-dynamic";

// Klient si zjistí, jak se aktuálně zpracovává platba kartou
// ("manual" = ruční potvrzení, "dish" = automatické odeslání do terminálu).
export async function GET() {
  return NextResponse.json({ cardProvider: activeCardProvider() });
}
