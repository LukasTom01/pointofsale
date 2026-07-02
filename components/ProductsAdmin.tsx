"use client";

import { useState } from "react";
import type { Category, Product } from "@/lib/types";
import { formatKc, halToKcInput, kcToHal } from "@/lib/money";

interface Props {
  initialCategories: Category[];
  initialProducts: Product[];
}

export default function ProductsAdmin({ initialCategories, initialProducts }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [products, setProducts] = useState(initialProducts);
  const [error, setError] = useState<string | null>(null);

  function catName(id?: string | null) {
    return categories.find((c) => c.id === id)?.name ?? "—";
  }

  async function api<T>(url: string, method: string, body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? "Chyba požadavku.");
    return data as T;
  }

  function withError(fn: () => Promise<void>) {
    setError(null);
    fn().catch((e) => setError(e instanceof Error ? e.message : "Neznámá chyba."));
  }

  // --- Kategorie ---
  function addCategory(name: string, color: string) {
    withError(async () => {
      const cat = await api<Category>("/api/categories", "POST", { name, color });
      setCategories((p) => [...p, cat]);
    });
  }
  function deleteCategory(id: string) {
    if (!confirm("Smazat kategorii? Produkty zůstanou bez kategorie.")) return;
    withError(async () => {
      await api(`/api/categories/${id}`, "DELETE");
      setCategories((p) => p.filter((c) => c.id !== id));
      setProducts((p) => p.map((x) => (x.categoryId === id ? { ...x, categoryId: null } : x)));
    });
  }

  // --- Produkty ---
  function addProduct(input: { name: string; priceHal: number; categoryId: string | null; emoji: string }) {
    withError(async () => {
      const prod = await api<Product>("/api/products", "POST", input);
      setProducts((p) => [...p, prod]);
    });
  }
  function patchProduct(id: string, patch: Partial<Product>) {
    withError(async () => {
      const prod = await api<Product>(`/api/products/${id}`, "PATCH", patch);
      setProducts((p) => p.map((x) => (x.id === id ? prod : x)));
    });
  }
  function deleteProduct(id: string) {
    if (!confirm("Opravdu smazat produkt?")) return;
    withError(async () => {
      await api(`/api/products/${id}`, "DELETE");
      setProducts((p) => p.filter((x) => x.id !== id));
    });
  }

  return (
    <div className="grid gap-6">
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      {/* Kategorie */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Kategorie</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {categories.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold text-white"
              style={{ backgroundColor: c.color ?? "#64748b" }}
            >
              {c.name}
              <button onClick={() => deleteCategory(c.id)} className="text-white/80 hover:text-white" aria-label="Smazat">
                ✕
              </button>
            </span>
          ))}
          {categories.length === 0 && <span className="text-sm text-slate-400">Zatím žádné kategorie.</span>}
        </div>
        <CategoryForm onAdd={addCategory} />
      </section>

      {/* Produkty */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Produkty ({products.length})</h2>
        <div className="mb-4">
          <ProductForm categories={categories} onAdd={addProduct} />
        </div>
        <div className="divide-y divide-slate-100">
          {products.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              categories={categories}
              catName={catName(p.categoryId)}
              onPatch={(patch) => patchProduct(p.id, patch)}
              onDelete={() => deleteProduct(p.id)}
            />
          ))}
          {products.length === 0 && <p className="py-4 text-center text-slate-400">Zatím žádné produkty.</p>}
        </div>
      </section>
    </div>
  );
}

function CategoryForm({ onAdd }: { onAdd: (name: string, color: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0ea5e9");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onAdd(name.trim(), color);
        setName("");
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Název kategorie"
        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
      />
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-12 rounded-lg border border-slate-300" />
      <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">Přidat</button>
    </form>
  );
}

function ProductForm({
  categories,
  onAdd,
}: {
  categories: Category[];
  onAdd: (input: { name: string; priceHal: number; categoryId: string | null; emoji: string }) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [emoji, setEmoji] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const priceHal = kcToHal(price);
        if (!name.trim() || priceHal == null || priceHal < 0) return;
        onAdd({ name: name.trim(), priceHal, categoryId: categoryId || null, emoji: emoji.trim() });
        setName("");
        setPrice("");
        setEmoji("");
      }}
      className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_auto_1fr_auto]"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Název produktu"
        className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
      />
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        inputMode="decimal"
        placeholder="Cena Kč"
        className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
      />
      <input
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        placeholder="🙂"
        maxLength={2}
        className="w-16 rounded-lg border border-slate-300 px-3 py-2 text-center outline-none focus:border-emerald-500"
      />
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
      >
        <option value="">Bez kategorie</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white">Přidat</button>
    </form>
  );
}

function ProductRow({
  product,
  categories,
  catName,
  onPatch,
  onDelete,
}: {
  product: Product;
  categories: Category[];
  catName: string;
  onPatch: (patch: Partial<Product>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(halToKcInput(product.priceHal));
  const [emoji, setEmoji] = useState(product.emoji ?? "");
  const [categoryId, setCategoryId] = useState(product.categoryId ?? "");

  if (editing) {
    return (
      <div className="grid gap-2 py-3 sm:grid-cols-[2fr_1fr_auto_1fr_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" />
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="rounded-lg border border-slate-300 px-3 py-2" />
        <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={2} className="w-16 rounded-lg border border-slate-300 px-3 py-2 text-center" />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2">
          <option value="">Bez kategorie</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const priceHal = kcToHal(price);
              if (!name.trim() || priceHal == null) return;
              onPatch({ name: name.trim(), priceHal, emoji: emoji.trim(), categoryId: categoryId || null });
              setEditing(false);
            }}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
          >
            Uložit
          </button>
          <button onClick={() => setEditing(false)} className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold">
            Zrušit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 py-3 ${product.active ? "" : "opacity-50"}`}>
      <span className="text-2xl">{product.emoji ?? "🛒"}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-800">{product.name}</p>
        <p className="text-sm text-slate-500">
          {formatKc(product.priceHal)} · {catName}
        </p>
      </div>
      <button
        onClick={() => onPatch({ active: !product.active })}
        className={`rounded-lg px-2 py-1 text-xs font-semibold ${
          product.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
        }`}
      >
        {product.active ? "Aktivní" : "Skryté"}
      </button>
      <button onClick={() => setEditing(true)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200">
        Upravit
      </button>
      <button onClick={onDelete} className="rounded-lg px-2 py-1.5 text-slate-400 hover:text-red-600" aria-label="Smazat">
        🗑
      </button>
    </div>
  );
}
