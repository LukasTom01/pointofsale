// Vytěžení údajů z fotky účtenky / PDF faktury přes Claude API (structured output).
// Potřebuje ANTHROPIC_API_KEY. Bez něj se doklad uloží a údaje se vyplní ručně.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

const Extracted = z.object({
  direction: z.enum(["in", "out"]).describe("out = výdaj (nákup, faktura od dodavatele), in = příjem (vydaná faktura, dar)"),
  amountKc: z.number().describe("Celková částka k úhradě v Kč včetně DPH"),
  issueDate: z.string().nullable().describe("Datum vystavení / nákupu, formát YYYY-MM-DD"),
  dueDate: z.string().nullable().describe("Datum splatnosti, formát YYYY-MM-DD, pokud je uvedeno"),
  counterparty: z.string().nullable().describe("Název dodavatele (u výdaje) nebo odběratele (u příjmu)"),
  ico: z.string().nullable().describe("IČO protistrany, jen číslice"),
  invoiceNumber: z.string().nullable().describe("Číslo faktury nebo účtenky"),
  variableSymbol: z.string().nullable().describe("Variabilní symbol pro platbu, jen číslice"),
  paidInCash: z.boolean().describe("true, pokud doklad ukazuje, že už bylo zaplaceno hotově nebo kartou na místě (účtenka z pokladny)"),
  description: z.string().describe("Krátký popis česky, co bylo koupeno / za co (max 80 znaků)"),
  categoryId: z.string().nullable().describe("Id nejvhodnější kategorie z nabídnutého seznamu, nebo null"),
});
export type ExtractedDoc = z.infer<typeof Extracted>;

const SUPPORTED_IMAGES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function extractDoc(
  file: { data: Buffer; mime: string },
  categories: { id: string; name: string; direction: string }[],
): Promise<{ ok: ExtractedDoc } | { error: string }> {
  if (!aiConfigured()) return { error: "Čtení dokladů není zapnuté (chybí ANTHROPIC_API_KEY)." };
  const isPdf = file.mime === "application/pdf";
  if (!isPdf && !SUPPORTED_IMAGES.has(file.mime)) return { error: "Umím přečíst jen fotku (JPG, PNG, WEBP) nebo PDF." };

  const data = file.data.toString("base64");
  const source: Anthropic.Beta.BetaContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : {
        type: "image",
        source: { type: "base64", media_type: file.mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data },
      };
  const catList = categories.map((c) => `${c.id} | ${c.direction === "in" ? "příjem" : "výdaj"} | ${c.name}`).join("\n");

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: betaZodOutputFormat(Extracted) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system:
        "Čteš české účetní doklady (účtenky, faktury) pro jednoduché účetnictví spolku. Vrať jen údaje, které na dokladu opravdu jsou; co tam není, dej null. Částky jako číslo v Kč.",
      messages: [
        {
          role: "user",
          content: [source, { type: "text", text: `Kategorie (id | typ | název):\n${catList}\n\nVytáhni údaje z dokladu.` }],
        },
      ],
    });
    if (response.stop_reason === "refusal") return { error: "Doklad se nepodařilo přečíst. Vyplňte údaje ručně." };
    const out = response.parsed_output;
    if (!out) return { error: "Doklad se nepodařilo přečíst. Vyplňte údaje ručně." };
    return { ok: out };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { error: "Neplatný ANTHROPIC_API_KEY." };
    if (e instanceof Anthropic.RateLimitError) return { error: "Čtení dokladů je přetížené, zkuste to za chvíli." };
    if (e instanceof Anthropic.APIError) return { error: `Čtení dokladu selhalo (${e.status}).` };
    return { error: "Čtení dokladu selhalo." };
  }
}
