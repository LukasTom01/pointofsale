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
- **Tým (`/admin/ukoly`, `/admin/smeny`, `/admin/dochazka`, `/admin/akce`)** –
  interní nástroj pro brigádníky, viz [Tým: úkoly, směny a docházka](#tým-úkoly-směny-a-docházka).
- **PWA** – lze „nainstalovat" na plochu telefonu/tabletu, funguje i v terminálu
  prohlížeče; základní offline cache.

## Technologie

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- Úložiště: **přepínatelné** za repository rozhraním (`lib/store.ts`)
  - **Postgres (Neon)** – když je nastavené `DATABASE_URL` (`lib/store/pg.ts`)
  - **JSON soubor** – jinak, pro lokální vývoj (`lib/store/file.ts`)

> **Úložiště:** aplikace si backend vybírá podle proměnné `DATABASE_URL`. Na
> produkci (Vercel) použijte Postgres přes [Neon](https://neon.tech); lokálně bez
> `DATABASE_URL` běží vše do souboru `data/db.json`. Obě implementace sdílejí
> stejné rozhraní (`lib/store/shared.ts`), takže zbytek aplikace je na volbě
> nezávislý.

## Spuštění

```bash
npm install
cp .env.example .env      # DATABASE_URL zde není potřeba; DISH proměnné volitelné
npm run seed              # naplní ukázkové produkty (přepíše data/db.json)
npm run dev               # vývoj na http://localhost:3000
# nebo produkčně:
npm run build && npm start
```

Bez `DATABASE_URL` se data ukládají do `data/db.json` (mimo git). Cestu lze
změnit proměnnou `DATA_DIR`.

## Nasazení online (Vercel + Neon Postgres)

1. **Databáze:** na [neon.tech](https://neon.tech) založte projekt a zkopírujte
   *pooled* connection string (obsahuje `-pooler`, končí `?sslmode=require`).
2. **Hosting:** na [vercel.com](https://vercel.com) vytvořte projekt z tohoto
   GitHub repa (framework se detekuje jako Next.js). V *Environment Variables*
   přidejte `DATABASE_URL` = váš Neon connection string a nasaďte.
3. **Naplnění produkty:** po nasazení otevřete web – na úvodní obrazovce je
   tlačítko **„Načíst ukázkové produkty"** (naplní katalog jen když je prázdný),
   nebo produkty přidejte ručně v administraci. Tabulky v databázi se vytvoří
   samy při prvním požadavku.

> Endpoint `POST /api/seed` vloží ukázková data pouze do prázdného katalogu
> (nikdy nemaže). CLI `npm run seed` naopak data **přepíše** – používejte ho jen
> lokálně.

## Platba kartou (Adyen Terminal API)

Platba kartou je **abstrahovaná** (`lib/payments.ts`) se dvěma režimy:

- **Ruční potvrzení (výchozí, funguje hned)** – brigádník naťuká částku do
  terminálu (i stávajícího **DISH PAY NOW**), zákazník zaplatí a v appce se
  prodej potvrdí. Bez integrace.
- **Automatické odeslání do terminálu přes Adyen** (`lib/adyen.ts`) – server
  pošle částku na Adyen Terminal API (cloud), terminál platbu provede a vrátí
  výsledek. Aktivuje se nastavením `ADYEN_*` proměnných v `.env`; appka se pak
  sama přepne z ručního potvrzení na odeslání do terminálu.

**DISH Pay běží na Adyenu**, takže pokud od DISH získáte API key, merchant
account a POIID k jejich terminálu, funguje tohle napojení rovnou na stávajícím
DISH PAY NOW – bez nového hardwaru. Jinak platí pro vlastní Adyen účet + Adyen
terminál.

**Spolehlivost platby kartou (Adyen):**

1. Objednávka se **uloží dřív, než se platba pošle do terminálu** – se stavem
   *Čeká na ověření* (`pending`). Když selže databáze, z karty se nic nestrhne.
2. Terminál vrátí výsledek → objednávka se označí jako zaplacená / neproběhlá.
3. Když odpověď nedorazí (timeout, výpadek sítě), appka se Adyenu zeptá na
   stav transakce (*TransactionStatus*); pokud platba na terminálu ještě běží,
   zruší ji (*AbortRequest*) a zeptá se znovu.
4. Když ani tak stav nezjistí, objednávka zůstane *Čeká na ověření* a obsluha
   ji ověří tlačítkem **Ověřit platbu** (v pokladně i v přehledu prodejů).
   Takové objednávky se nepočítají do tržby, dokud nejsou ověřené.

Během čekání na terminál nejde dialog platby zavřít ani platbu odeslat znovu.
Způsob zpracování karty (ruční / terminál) určuje výhradně server.

**Testování bez terminálu:** nastavte `ADYEN_SIMULATE=1` – platba se „schválí"
bez volání Adyenu, takže lze vyzkoušet celý průběh v pokladně.

Přidání dalšího poskytovatele (SumUp / Viva / …) = přidání další větve ve stejné
abstrakci; zbytek aplikace se nemění.

## Zamčení administrace

Nastavte proměnnou `ADMIN_PASSWORD`. Administrace (`/admin`), výpisy prodejů,
export a změny katalogu/lidí pak vyžadují přihlášení na `/prihlaseni` (cookie
platí 60 dní, „Odhlásit“ v liště). Pokladna (`/`) zůstává otevřená.
Bez `ADMIN_PASSWORD` je vše otevřené jako dřív.

## Tým: úkoly, směny a docházka

Jednoduchý interní nástroj nad seznamem **Lidé** (stejní lidé jako u „na účet“).

- **Úkoly** – rychlé přidání (název, termín **den + volitelně čas**, kdo – i víc
  lidí najednou, akce, **přílohy**), zaškrtnutí hotovo, filtry (otevřené / kdo /
  akce / po termínu / termín do 3 dnů).
  - **Přehled** nahoře v Úkolech i na úvodní stránce administrace: otevřené úkoly
    **po termínu** a úkoly s **termínem do 3 dnů**. Úkol s časem je po termínu od
    té minuty, bez času až další den.
  - **Přílohy** (fotky, PDF, dokumenty) – max 4 MB najednou, max 10 na úkol.
    Fotky z mobilu se před odesláním samy zmenší. Ukládají se do databáze (Neon),
    nic dalšího se nastavovat nemusí. Pracovník je uvidí u svého úkolu přes osobní
    odkaz.
- **Směny** – ruční plán lidé × dny (týden, nebo dny vybrané akce): „+“ přidá
  směnu, klik ji upraví / smaže / zkopíruje na další dny a lidi; nejčastější
  časy jako rychlá tlačítka; pozice s barvou; varování při překryvu; obsazení
  po hodinách.
- **Docházka** – denní pohled po pozicích: Přišel/a / Nepřišel/a, oprava
  příchodu a odchodu. **Souhrn hodin** za období/akci a **výkaz do Excelu**
  (list Souhrn + list pro každého). Žádné mzdy – jen hodiny.
- **Akce** (nepovinné) – seskupí úkoly a směny (festival, trh…) a **Pozice**.
- **Osobní odkaz** (`/muj/<token>`) – v Lidé → „Vytvořit odkaz“, poslat
  člověku (WhatsApp/SMS). Bez registrace uvidí své směny na 14 dní, dnes
  tlačítka **Jsem tady / Odcházím** a své úkoly k odškrtnutí. Lze přidat na
  plochu (vlastní manifest). „Nový odkaz“ starý zneplatní, „Zrušit“ ho vypne.

Data jsou v tabulkách `team_*` (Postgres, vytvoří se samy) nebo v
`data/team.json`. Časy jsou v české zóně. Testy doménové logiky: `npm test`.

## Struktura

```
app/                 stránky a API (App Router)
  page.tsx           pokladna (POS)
  admin/             administrace (produkty, prodeje, lidé, úkoly, směny, docházka, akce)
  muj/[token]/       osobní přehled pracovníka (směny, příchod/odchod, úkoly)
  prihlaseni/        přihlášení do administrace (ADMIN_PASSWORD)
  api/               REST endpointy (products, categories, orders, config)
components/           klientské komponenty (POS, Checkout, ProductsAdmin, …)
lib/
  types.ts           doménové typy (částky v haléřích)
  store.ts           souborové úložiště (repository rozhraní)
  orders.ts          sestavení a zaevidování objednávky
  payments.ts        abstrakce platby kartou
  adyen.ts           Adyen Terminal API klient
  money.ts           formátování/parsování Kč
  adminAuth.ts       admin heslo (cookie, chráněné cesty pro middleware)
  team/              modul Tým: typy, doménová logika + testy, úložiště, výkaz
scripts/seed.ts      ukázková data
public/              manifest, service worker, ikona (PWA)
```

## Peněžní částky

Všechny částky jsou interně v **haléřích** (celé číslo, 1 Kč = 100), aby
nevznikaly chyby ze zaokrouhlování desetinných čísel. Formátování zajišťuje
`lib/money.ts`.
