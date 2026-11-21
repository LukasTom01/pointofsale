// Stažení přílohy úkolu z administrace (cesta /api/team je za heslem v middleware).
import { requireAdmin } from "@/lib/adminServer";
import { teamStore } from "@/lib/team/store";
import { attachmentResponse } from "@/lib/team/attachments";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return new Response("Nejste přihlášeni do administrace.", { status: 401 });
  }
  const { id } = await params;
  const file = await teamStore.getAttachment(id);
  if (!file) return new Response("Příloha nenalezena.", { status: 404 });
  return attachmentResponse(file.meta, file.data, new URL(request.url).searchParams.has("stahnout"));
}
