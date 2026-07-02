import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-center gap-4">
          <Link href="/" className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20">
            ← Pokladna
          </Link>
          <span className="font-bold">Administrace</span>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link href="/admin/produkty" className="rounded-lg px-3 py-1.5 hover:bg-white/10">
            Produkty
          </Link>
          <Link href="/admin/prodeje" className="rounded-lg px-3 py-1.5 hover:bg-white/10">
            Prodeje
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl p-4">{children}</main>
    </div>
  );
}
