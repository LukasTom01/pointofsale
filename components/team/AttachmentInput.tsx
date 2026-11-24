"use client";

import { useEffect, useRef, useState } from "react";

const MAX_TOTAL = 4 * 1024 * 1024;
const MAX_SIDE = 1920;
const SHRINKABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

const sizeText = (b: number) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} kB` : `${(Math.round((b / 1024 / 1024) * 10) / 10).toLocaleString("cs-CZ")} MB`;

/** Fotku z mobilu zmenší na max 1920 px (JPEG); když se nepovede nebo nepomůže, nechá originál. */
export async function shrink(file: File): Promise<File> {
  if (!SHRINKABLE.has(file.type) || file.size < 400 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Výběr příloh: soubory se odešlou s formulářem v poli `attachment`. */
export default function AttachmentInput() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const hidden = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // Vybrané (zmenšené) soubory přeneseme do skrytého pole, které formulář odešle.
  useEffect(() => {
    if (!hidden.current) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    hidden.current.files = dt.files;
  }, [files]);

  const total = files.reduce((s, f) => s + f.size, 0);
  const tooBig = total > MAX_TOTAL;

  return (
    <div className="space-y-1.5">
      <input ref={hidden} type="file" name="attachment" multiple hidden tabIndex={-1} aria-hidden />
      <input
        ref={picker}
        type="file"
        multiple
        className="hidden"
        onChange={async (e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (picked.length === 0) return;
          setBusy(true);
          const ready = await Promise.all(picked.map(shrink));
          setFiles((prev) => [...prev, ...ready]);
          setBusy(false);
        }}
      />
      <button
        type="button"
        onClick={() => picker.current?.click()}
        className="rounded-lg border border-dashed border-slate-400 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        📎 {busy ? "Připravuji…" : "Přidat přílohu"}
      </button>
      {files.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2">
              <span className="min-w-0 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{sizeText(f.size)}</span>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="shrink-0 text-xs text-red-600 hover:underline"
              >
                odebrat
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {tooBig ? (
        <p className="text-xs text-red-600">Najednou lze nahrát max 4 MB (teď {sizeText(total)}). Odeberte některý soubor.</p>
      ) : null}
    </div>
  );
}
