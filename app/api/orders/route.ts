import { NextResponse } from "next/server";
import { listOrders } from "@/lib/store";
import { placeOrder, OrderError } from "@/lib/orders";
import type { CreateOrderInput } from "@/lib/types";

export const dynamic = "force-dynamic";
// Platba kartou na terminálu (Adyen) může běžet déle – necháme routě víc času.
export const maxDuration = 120;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const day = searchParams.get("day"); // "YYYY-MM-DD" (lokální den)
  const limit = searchParams.get("limit");
  let from: Date | undefined;
  let to: Date | undefined;
  if (day) {
    from = new Date(`${day}T00:00:00`);
    to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  }
  const orders = await listOrders({
    from,
    to,
    limit: limit ? Number(limit) : undefined,
  });
  return NextResponse.json(orders);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateOrderInput | null;
  if (!body) {
    return NextResponse.json({ error: "Neplatné tělo požadavku." }, { status: 400 });
  }
  try {
    const order = await placeOrder(body);
    return NextResponse.json(order, { status: 201 });
  } catch (e) {
    if (e instanceof OrderError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("Chyba při vytváření objednávky:", e);
    return NextResponse.json({ error: "Interní chyba serveru." }, { status: 500 });
  }
}
