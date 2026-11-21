import { NextResponse } from "next/server";
import { createStaff, listStaff } from "@/lib/store";

export const dynamic = "force-dynamic";

// Lidé, kterým lze zapsat objednávku „na účet“.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const staff = await listStaff({ activeOnly: searchParams.get("activeOnly") === "1" });
  return NextResponse.json(staff);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Zadejte jméno." }, { status: 400 });
  const member = await createStaff({ name, active: body.active });
  return NextResponse.json(member, { status: 201 });
}
