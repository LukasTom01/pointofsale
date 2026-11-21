// Příloha úkolu pro pracovníka: jen přes platný osobní odkaz a jen u jeho úkolů.
import { getStaff } from "@/lib/store";
import { teamStore } from "@/lib/team/store";
import { attachmentResponse } from "@/lib/team/attachments";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const notFound = () => new Response("Příloha nenalezena.", { status: 404 });
  const profile = token.length >= 16 ? await teamStore.profileByToken(token) : null;
  if (!profile || !(await getStaff(profile.staffId))) return notFound();
  const file = await teamStore.getAttachment(id);
  if (!file) return notFound();
  const task = await teamStore.getTask(file.meta.taskId);
  if (!task || !task.assigneeIds.includes(profile.staffId)) return notFound();
  return attachmentResponse(file.meta, file.data, new URL(request.url).searchParams.has("stahnout"));
}
