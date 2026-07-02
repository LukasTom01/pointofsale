import { NextResponse } from "next/server";
import { listProducts } from "@/lib/store";
import { seedSampleData } from "@/lib/seedSample";

export const dynamic = "force-dynamic";

// Naplní ukázkové produkty – jen když je katalog prázdný (bezpečné, nic nemaže).
export async function POST() {
  const existing = await listProducts();
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Katalog už obsahuje produkty. Ukázková data lze načíst jen do prázdného katalogu." },
      { status: 409 },
    );
  }
  const result = await seedSampleData();
  return NextResponse.json(result, { status: 201 });
}
