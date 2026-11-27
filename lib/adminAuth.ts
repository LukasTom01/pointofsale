// Zámek administrace jedním heslem (ADMIN_PASSWORD). Když heslo není nastavené,
// administrace zůstává otevřená jako dřív. Přihlášení = httpOnly cookie s HMAC
// hesla, takže se heslo nikam neukládá a jeho změna odhlásí všechny.
// Funguje v middleware (Edge) i na serveru (Web Crypto).

export const ADMIN_COOKIE = "pos_admin";

export function adminPassword(): string | null {
  return process.env.ADMIN_PASSWORD?.trim() || null;
}

export async function adminToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("pos-admin-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Platí cookie? Bez nastaveného hesla je přístup volný. */
export async function isAdminCookie(value: string | undefined): Promise<boolean> {
  const password = adminPassword();
  if (!password) return true;
  if (!value) return false;
  return value === (await adminToken(password));
}

/** Které cesty chrání heslo: administrace, export a změny katalogu / lidí / prodejů. */
export function isProtectedPath(pathname: string, method: string): boolean {
  if (pathname === "/prihlaseni") return false;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (pathname.startsWith("/api/export") || pathname.startsWith("/api/team") || pathname.startsWith("/api/finance")) return true;
  if (pathname === "/api/orders" && method === "GET") return true;
  if (/^\/api\/(products|categories|staff)(\/|$)/.test(pathname) && method !== "GET") return true;
  return false;
}
