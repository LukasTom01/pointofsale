"use client";

import { useState, useTransition } from "react";
import { shrink } from "./AttachmentInput";

type Result = { error?: string; ok?: boolean } | undefined;

/** Jedno ťuknutí: otevře foťák, fotku zmenší, nahraje a úkol odškrtne. */
export default function PhotoDoneButton({
  token,
  taskId,
  action,
  label = "📷 Vyfotit a hotovo",
  compact = false,
}: {
  token: string;
  taskId: string;
  action: (prev: Result, fd: FormData) => Promise<Result>;
  label?: string;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <label
        className={`flex cursor-pointer items-center justify-center rounded-xl font-bold text-white active:bg-emerald-700 ${
          pending ? "bg-emerald-400" : "bg-emerald-600"
        } ${compact ? "px-3 py-2 text-sm" : "w-full py-3 text-base"}`}
      >
        {pending ? "Nahrávám…" : label}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError(null);
            start(async () => {
              const fd = new FormData();
              fd.set("token", token);
              fd.set("taskId", taskId);
              fd.set("photo", await shrink(file));
              const res = await action(undefined, fd);
              if (res?.error) setError(res.error);
            });
          }}
        />
      </label>
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
