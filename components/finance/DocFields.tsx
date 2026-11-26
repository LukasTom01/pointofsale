import { halToKcInput } from "@/lib/money";
import type { FinCategory, FinDoc } from "@/lib/finance/types";

const field = "h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm";

/** Pole dokladu. Kategorie určuje příjem/výdaj, „Zaplaceno“ pokladnu / účet / nezaplaceno. */
export default function DocFields({ doc, cats, today }: { doc?: Partial<FinDoc>; cats: FinCategory[]; today: string }) {
  const active = cats.filter((c) => (c.active && !c.transfer) || c.id === doc?.categoryId || (c.transfer && c.direction === "out"));
  const paid = doc?.status === "unpaid" ? "unpaid" : doc?.status === "draft" && !doc.date ? "unpaid" : doc?.channel ?? "cash";
  const group = (dir: "in" | "out") =>
    active
      .filter((c) => c.direction === dir)
      .map((c) => (
        <option key={c.id} value={c.id}>
          {c.transfer ? (dir === "out" ? "Vklad hotovosti na účet / výběr z účtu" : c.name) : c.name}
        </option>
      ));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          name="amount"
          inputMode="decimal"
          required
          placeholder="Částka Kč"
          defaultValue={doc?.amountHal ? halToKcInput(doc.amountHal) : ""}
          className={`${field} w-32 text-base font-semibold`}
        />
        <select name="categoryId" required defaultValue={doc?.categoryId ?? ""} className={`${field} min-w-56 flex-1`}>
          <option value="" disabled>
            Kategorie…
          </option>
          <optgroup label="Výdaje">{group("out")}</optgroup>
          <optgroup label="Příjmy">{group("in")}</optgroup>
        </select>
        <select name="paid" defaultValue={paid} className={field} aria-label="Zaplaceno">
          <option value="cash">Zaplaceno hotově (pokladna)</option>
          <option value="bank">Zaplaceno přes účet</option>
          <option value="unpaid">Zatím nezaplaceno</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          dne
          <input name="date" type="date" defaultValue={doc?.date ?? (doc ? "" : today)} className={field} />
        </label>
      </div>
      <input name="description" maxLength={200} defaultValue={doc?.description ?? ""} placeholder="Popis (co a proč)" className={`${field} w-full`} />
      <details className="text-sm" open={Boolean(doc?.counterparty || doc?.invoiceNumber)}>
        <summary className="cursor-pointer text-slate-500">Další údaje (dodavatel, faktura, splatnost, činnost)</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <input name="counterparty" maxLength={120} defaultValue={doc?.counterparty ?? ""} placeholder="Dodavatel / odběratel" className={`${field} min-w-48 flex-1`} />
          <input name="ico" maxLength={12} defaultValue={doc?.ico ?? ""} placeholder="IČO" className={`${field} w-28`} />
          <input name="invoiceNumber" maxLength={40} defaultValue={doc?.invoiceNumber ?? ""} placeholder="Č. faktury / účtenky" className={`${field} w-40`} />
          <input name="variableSymbol" maxLength={10} defaultValue={doc?.variableSymbol ?? ""} placeholder="VS" className={`${field} w-28`} />
          <label className="flex items-center gap-1 text-slate-600">
            vystaveno
            <input name="issueDate" type="date" defaultValue={doc?.issueDate ?? ""} className={field} />
          </label>
          <label className="flex items-center gap-1 text-slate-600">
            splatnost
            <input name="dueDate" type="date" defaultValue={doc?.dueDate ?? ""} className={field} />
          </label>
          <select name="activity" defaultValue={doc?.id && doc.status !== "draft" ? doc.activity : ""} className={field} aria-label="Činnost">
            <option value="">Činnost podle kategorie</option>
            <option value="main">Hlavní činnost</option>
            <option value="side">Hospodářská činnost</option>
          </select>
          <input name="note" maxLength={1000} defaultValue={doc?.note ?? ""} placeholder="Poznámka" className={`${field} w-full`} />
        </div>
      </details>
    </div>
  );
}
