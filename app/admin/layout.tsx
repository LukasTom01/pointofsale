import Link from "next/link";

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
        <nav className="flex flex-wrap gap-1 text-sm">
          <Link href="/admin/produkty" className="rounded-lg px-3 py-1.5 hover:bg-white/10">
            Produkty
          </Link>
          <Link href="/admin/prodeje" className="rounded-lg px-3 py-1.5 hover:bg-white/10">
            Prodeje
          </Link>
          <Link href="/admin/lide" className="rounded-lg px-3 py-1.5 hover:bg-white/10">
            Lidé
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl p-4">{children}</main>
    </div>
  );
}
