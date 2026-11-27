import Link from "next/link";

const TABS = [
  { href: "/admin/finance", label: "Přehled" },
  { href: "/admin/finance/denik", label: "Peněžní deník" },
  { href: "/admin/finance/banka", label: "Banka" },
  { href: "/admin/finance/vykazy", label: "Výkazy" },
  { href: "/admin/finance/nastaveni", label: "Nastavení" },
];

export default function FinanceNav({ active }: { active: string }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-2 text-sm">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`rounded-lg px-3 py-1.5 ${active === t.href ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
