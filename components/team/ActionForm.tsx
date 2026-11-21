"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import type { FormState } from "@/app/admin/tym/actions";

/**
 * Formulář pro server action vracející { ok | error }; volitelné potvrzení (mazání).
 * `resetOnOk` po úspěchu vyprázdní i klientské prvky (vybraní lidé, přílohy).
 */
export default function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnOk,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  confirm?: string;
  resetOnOk?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);
  const [generation, setGeneration] = useState(0);
  const seen = useRef<FormState>(undefined);
  useEffect(() => {
    if (resetOnOk && state?.ok && state !== seen.current) setGeneration((g) => g + 1);
    seen.current = state;
  }, [state, resetOnOk]);

  return (
    <form
      key={generation}
      action={formAction}
      className={className ?? "space-y-2"}
      aria-busy={pending}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {pending ? <p className="text-sm text-slate-500">Ukládám…</p> : null}
      {!pending && state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {!pending && state?.ok ? (
        <p className="text-sm text-emerald-700" role="status">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
