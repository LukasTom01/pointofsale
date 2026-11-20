import { NextResponse } from "next/server";
import { verifyOrderPayment, OrderError, PaymentPendingError } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Dodatečné ověření platby kartou, jejíž výsledek nebyl jistý (stav "pending").
// Zeptá se Adyenu na stav transakce a výsledek zapíše k objednávce.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const order = await verifyOrderPayment(id);
    return NextResponse.json(order);
  } catch (e) {
    if (e instanceof PaymentPendingError) {
      return NextResponse.json({ error: e.message, pending: true, order: e.order }, { status: 202 });
    }
    if (e instanceof OrderError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("Chyba při ověřování platby:", e);
    return NextResponse.json({ error: "Interní chyba serveru." }, { status: 500 });
  }
}
