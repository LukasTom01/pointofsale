import { NextResponse } from "next/server";
import { deleteCategory, updateCategory } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatné tělo." }, { status: 400 });
  const updated = await updateCategory(id, {
    name: typeof body.name === "string" ? body.name.trim() : undefined,
    color: body.color,
    sortOrder: body.sortOrder,
  });
  if (!updated) return NextResponse.json({ error: "Kategorie nenalezena." }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deleteCategory(id);
  if (!ok) return NextResponse.json({ error: "Kategorie nenalezena." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
