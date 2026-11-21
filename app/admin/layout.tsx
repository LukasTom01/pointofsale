import Link from "next/link";
import { adminPassword } from "@/lib/adminAuth";
import { logout } from "@/app/prihlaseni/actions";

const NAV = [
  { href: "/admin/produkty", label: "Produkty" },
  { href: "/admin/prodeje", label: "Prodeje" },
  { href: "/admin/lide", label: "Lidé" },
  { href: "/admin/ukoly", label: "Úkoly" },
  { href: "/admin/smeny", label: "Směny" },
  { href: "/admin/dochazka", label: "Docházka" },
  { href: "/admin/akce", label: "Akce" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-center gap-4">
          <Link href="/" className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20">
            ← Pokladna
          </Link>
          <span className="font-bold">Administrace</span>
        </div>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg px-3 py-1.5 hover:bg-white/10">
              {item.label}
            </Link>
          ))}
          {adminPassword() ? (
            <form action={logout}>
              <button className="rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10">Odhlásit</button>
            </form>
          ) : null}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
