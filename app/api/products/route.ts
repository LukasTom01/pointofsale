import { NextResponse } from "next/server";
import { createProduct, listProducts } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("activeOnly") === "1";
  const products = await listProducts({ activeOnly });
  return NextResponse.json(products);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || typeof body.priceHal !== "number") {
    return NextResponse.json({ error: "Chybí name nebo priceHal." }, { status: 400 });
  }
  if (body.priceHal < 0 || !Number.isInteger(body.priceHal)) {
    return NextResponse.json({ error: "priceHal musí být nezáporné celé číslo (haléře)." }, { status: 400 });
  }
  const product = await createProduct({
    name: body.name.trim(),
    priceHal: body.priceHal,
    categoryId: body.categoryId ?? null,
    emoji: body.emoji,
    active: body.active,
    sortOrder: body.sortOrder,
  });
  return NextResponse.json(product, { status: 201 });
}
