import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, isAdminCookie, isProtectedPath } from "@/lib/adminAuth";

// Administrace (a její API) za heslem ADMIN_PASSWORD; pokladna zůstává volná.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isProtectedPath(pathname, request.method)) return NextResponse.next();
  if (await isAdminCookie(request.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Nejste přihlášeni do administrace." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/prihlaseni";
  url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
