import { NextResponse } from "next/server";
import { deleteProduct, updateProduct } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatné tělo." }, { status: 400 });
  if (body.priceHal != null && (!Number.isInteger(body.priceHal) || body.priceHal < 0)) {
    return NextResponse.json({ error: "priceHal musí být nezáporné celé číslo." }, { status: 400 });
  }
  const updated = await updateProduct(id, {
    name: typeof body.name === "string" ? body.name.trim() : undefined,
    priceHal: body.priceHal,
    categoryId: body.categoryId,
    emoji: body.emoji,
    active: body.active,
    sortOrder: body.sortOrder,
  });
  if (!updated) return NextResponse.json({ error: "Produkt nenalezen." }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deleteProduct(id);
  if (!ok) return NextResponse.json({ error: "Produkt nenalezen." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
