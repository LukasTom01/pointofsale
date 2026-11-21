// Přílohy úkolů: limity, uložení nahraných souborů a bezpečné servírování.
import { teamStore } from "./store";
import type { TaskAttachment } from "./types";

/** Vercel přijme max ~4,5 MB na požadavek – držíme se pod tím (fotky se zmenší už v prohlížeči). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_FILES_PER_TASK = 10;

/** Typy, které prohlížeč smí zobrazit přímo (ostatní se jen stáhnou – žádné HTML/SVG). */
const INLINE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

const cleanName = (name: string) =>
  name.replace(/[\\/\u0000-\u001f"]/g, "_").trim().slice(0, 150) || "priloha";

/** Uloží soubory z pole `attachment` k úkolu. Vrací chybu, nebo null. */
export async function saveUploads(taskId: string, fd: FormData): Promise<string | null> {
  const files = fd.getAll("attachment").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return null;
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_UPLOAD_BYTES) return "Přílohy jsou moc velké – najednou lze nahrát max 4 MB.";
  const existing = (await teamStore.listAttachments()).filter((a) => a.taskId === taskId).length;
  if (existing + files.length > MAX_FILES_PER_TASK) return `K úkolu lze přiložit max ${MAX_FILES_PER_TASK} souborů.`;
  for (const f of files) {
    await teamStore.addAttachment(
      { taskId, name: cleanName(f.name), mime: f.type || "application/octet-stream", size: f.size },
      Buffer.from(await f.arrayBuffer()),
    );
  }
  return null;
}

/** HTTP odpověď se souborem: obrázky/PDF inline, ostatní jako stažení; bez možnosti spustit skript. */
export function attachmentResponse(meta: TaskAttachment, data: Buffer, download: boolean): Response {
  const inline = !download && INLINE_TYPES.has(meta.mime);
  const ascii = meta.name.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "") || "priloha";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": inline ? meta.mime : "application/octet-stream",
      "Content-Length": String(data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=3600",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(Math.round((bytes / 1024 / 1024) * 10) / 10).toLocaleString("cs-CZ")} MB`;
}
