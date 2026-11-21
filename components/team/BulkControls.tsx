"use client";

import type { ButtonHTMLAttributes } from "react";

/** Zaškrtne / odškrtne všechna políčka `sel` patřící k formuláři `form`. */
export function SelectAll({ form }: { form: string }) {
  return (
    <button
      type="button"
      className="h-10 rounded-lg border border-slate-300 bg-white px-3"
      onClick={() => {
        const boxes = Array.from(document.querySelectorAll<HTMLInputElement>(`input[form="${form}"][name="sel"]`));
        const on = boxes.some((b) => !b.checked);
        boxes.forEach((b) => (b.checked = on));
      }}
    >
      Vybrat vše / nic
    </button>
  );
}

/** Odesílací tlačítko s potvrzením. */
export function ConfirmButton({ message, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { message: string }) {
  return (
    <button
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
