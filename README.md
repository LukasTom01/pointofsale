# Stánkový prodej – POS

Webová aplikace (PWA) pro rychlé zadávání objednávek na stánkovém prodeji.
Brigádník naklikáním sestaví objednávku, aplikace **zaeviduje prodej** a nabídne
**platbu hotovostí nebo kartou**.

## Co umí

- **Pokladna (`/`)** – dlaždice produktů po kategoriích, klikáním se plní košík,
  úprava počtu kusů, průběžný součet.
- **Platba**
  - **Hotovost** – zadání přijaté částky, automatický výpočet vrácení, rychlé
    částky (kulaté nad součtem).
  - **Karta** – dvě varianty (viz [Platba kartou](#platba-kartou-a-dish)).
- **Evidence prodeje** – každá objednávka se uloží s pořadovým číslem účtenky,
  položkami (snapshot názvu a ceny), způsobem platby a časem.
- **Administrace (`/admin`)**
  - Správa **produktů** a **kategorií** (přidání, úprava, skrytí, smazání).
  - **Přehled prodejů** – denní tržba, počet účtenek, rozpad hotovost/karta,
    seznam účtenek s položkami.
- **PWA** – lze „nainstalovat" na plochu telefonu/tabletu, funguje i v terminálu
  prohlížeče; základní offline cache.

## Technologie

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- Úložiště: **JSON soubor** za repository rozhraním (`lib/store.ts`)

> **Poznámka k úložišti:** místo SQL databáze používá appka souborové JSON
> úložiště. Důvod je čistě provozní (prostředí, kde vznikala, neumělo spolehlivě
> stáhnout nativní DB binárky). Datová vrstva má ale rozhraní jako repository nad
> databází, takže se dá **bez zásahu do zbytku aplikace vyměnit za Postgres/Prisma**
> – stačí přepsat `lib/store.ts`. Pro reálný provoz s více zařízeními a trvalým
> uložením to doporučuji udělat.

## Spuštění

```bash
npm install
cp .env.example .env      # DATABASE_URL zde není potřeba; DISH proměnné volitelné
npm run seed              # naplní ukázkové produkty (přepíše data/db.json)
npm run dev               # vývoj na http://localhost:3000
# nebo produkčně:
npm run build && npm start
```

Data se ukládají do `data/db.json` (mimo git). Cestu lze změnit proměnnou
`DATA_DIR`.

## Platba kartou a DISH

Platba kartou je schválně **abstrahovaná** (`lib/payments.ts`), aby appka nebyla
svázaná s konkrétním terminálem:

- **Ruční potvrzení (výchozí, funguje hned)** – brigádník naťuká částku do
  stávajícího terminálu **DISH PAY NOW**, zákazník zaplatí a v appce se prodej
  potvrdí. Nevyžaduje žádnou integraci.
- **Automatické odeslání do DISH (připravený slot)** – DISH Digital Solutions
  **nemá veřejné API** pro odeslání částky do terminálu; vyžadovalo by to
  partnerský/certifikovaný přístup. Kód i UI jsou připravené: jakmile budou
  k dispozici přístupové údaje, vyplní se v `.env` (`DISH_API_BASE`,
  `DISH_API_KEY`, `DISH_TERMINAL_ID`) a doplní se volání ve funkci
  `chargeViaDish` v `lib/payments.ts`. Aplikace se pak automaticky přepne z
  ručního potvrzení na odeslání do terminálu.

Přidání jiného poskytovatele s veřejným API (SumUp / Square / Adyen / Tap to Pay)
= přidání další větve ve stejné abstrakci; zbytek aplikace se nemění.

## Struktura

```
app/                 stránky a API (App Router)
  page.tsx           pokladna (POS)
  admin/             administrace (produkty, prodeje)
  api/               REST endpointy (products, categories, orders, config)
components/           klientské komponenty (POS, Checkout, ProductsAdmin, …)
lib/
  types.ts           doménové typy (částky v haléřích)
  store.ts           souborové úložiště (repository rozhraní)
  orders.ts          sestavení a zaevidování objednávky
  payments.ts        abstrakce platby kartou (+ DISH slot)
  money.ts           formátování/parsování Kč
scripts/seed.ts      ukázková data
public/              manifest, service worker, ikona (PWA)
```

## Peněžní částky

Všechny částky jsou interně v **haléřích** (celé číslo, 1 Kč = 100), aby
nevznikaly chyby ze zaokrouhlování desetinných čísel. Formátování zajišťuje
`lib/money.ts`.
