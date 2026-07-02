// Pomůcky pro práci s částkami. Interně vždy haléře (celé číslo).

/** Naformátuje haléře jako Kč, např. 12500 -> "125,00 Kč". */
export function formatKc(hal: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(hal / 100);
}

/** Kč (číslo nebo string s čárkou/tečkou) -> haléře. Vrací null při chybě. */
export function kcToHal(value: string | number): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Haléře -> string "125.00" pro editaci v inputu. */
export function halToKcInput(hal: number): string {
  return (hal / 100).toFixed(2);
}
