"use client";

import { useActionState, useRef, useState } from "react";
import { shrink } from "@/components/team/AttachmentInput";

type State = { ok?: string; error?: string } | undefined;

/** Nahrání fotek / PDF dokladů; fotky se před odesláním zmenší. */
export default function UploadDocs({ action, aiOn }: { action: (prev: State, fd: FormData) => Promise<State>; aiOn: boolean }) {
  const [state, run, pending] = useActionState<State, FormData>(action, undefined);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function send(files: File[]) {
    setBusy(true);
    const fd = new FormData();
    for (const f of await Promise.all(files.map(shrink))) fd.append("files", f);
    setBusy(false);
    run(fd);
  }

  return (
    <div className="space-y-2">
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center hover:bg-slate-50 ${
          pending || busy ? "opacity-60" : ""
        }`}
      >
        <span className="text-3xl">📷</span>
        <span className="font-semibold">{pending ? "Čtu doklady…" : busy ? "Připravuji…" : "Vyfotit nebo nahrát doklady"}</span>
        <span className="text-xs text-slate-500">
          Účtenky, faktury (foto nebo PDF), i víc najednou.{aiOn ? " Údaje se vyplní samy, vy je jen zkontrolujete." : ""}
        </span>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          disabled={pending || busy}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) send(files);
          }}
        />
      </label>
      {!pending && state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {!pending && state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
    </div>
  );
}
