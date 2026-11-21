"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/app/admin/tym/actions";

/** Formulář pro server action vracející { ok | error }; volitelné potvrzení (mazání). */
export default function ActionForm({
  action,
  children,
  className,
  confirm,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, undefined);
  return (
    <form
      action={formAction}
      className={className ?? "space-y-2"}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state?.ok ? (
        <p className="text-sm text-emerald-700" role="status">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
