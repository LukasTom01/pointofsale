// Plánované notifikace (připomínky, po termínu, ranní souhrn) a úkoly pozic.
// Volat každých 5 minut: Vercel Cron (hlavička Authorization: Bearer CRON_SECRET)
// nebo externí služba (např. cron-job.org) na /api/cron?key=CRON_SECRET.
import { runReminders } from "@/lib/team/notify";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ error: "Nastavte CRON_SECRET." }, { status: 503 });
  const url = new URL(request.url);
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}` && url.searchParams.get("key") !== secret) {
    return Response.json({ error: "Neplatný klíč." }, { status: 401 });
  }
  const result = await runReminders();
  return Response.json({ ok: true, ...result });
}
