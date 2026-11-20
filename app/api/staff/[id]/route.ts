import { NextResponse } from "next/server";
import { deleteStaff, updateStaff } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatné tělo." }, { status: 400 });
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name === "") return NextResponse.json({ error: "Jméno nesmí být prázdné." }, { status: 400 });
  const updated = await updateStaff(id, {
    name,
    active: typeof body.active === "boolean" ? body.active : undefined,
    sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
  });
  if (!updated) return NextResponse.json({ error: "Nenalezeno." }, { status: 404 });
  return NextResponse.json(updated);
}

// Smazání osoby nemaže její historii – objednávky si drží jméno (snapshot).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deleteStaff(id);
  if (!ok) return NextResponse.json({ error: "Nenalezeno." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
