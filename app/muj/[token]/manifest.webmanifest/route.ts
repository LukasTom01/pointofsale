// Manifest pro „Přidat na plochu“: ikona otevře rovnou osobní přehled.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const start = `/muj/${encodeURIComponent(token)}`;
  return Response.json(
    {
      name: "Moje směny",
      short_name: "Směny",
      start_url: start,
      scope: start,
      id: start,
      display: "standalone",
      background_color: "#0f172a",
      theme_color: "#0f172a",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } },
  );
}
