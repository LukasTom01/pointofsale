// Soubor dokladu (fotka, PDF) – jen pro administraci (/api/finance je za heslem).
import { requireAdmin } from "@/lib/adminServer";
import { finStore } from "@/lib/finance/store";
import { attachmentResponse } from "@/lib/team/attachments";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return new Response("Nejste přihlášeni do administrace.", { status: 401 });
  }
  const { id } = await params;
  const file = await finStore.getFile(id);
  if (!file) return new Response("Soubor nenalezen.", { status: 404 });
  const meta = { ...file.meta, taskId: file.meta.docId, staffId: null };
  return attachmentResponse(meta, file.data, new URL(request.url).searchParams.has("stahnout"));
}
