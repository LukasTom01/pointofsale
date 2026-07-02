import { NextResponse } from "next/server";
import { createCategory, listCategories } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listCategories());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Chybí name." }, { status: 400 });
  }
  const category = await createCategory({
    name: body.name.trim(),
    color: body.color,
    sortOrder: body.sortOrder,
  });
  return NextResponse.json(category, { status: 201 });
}
