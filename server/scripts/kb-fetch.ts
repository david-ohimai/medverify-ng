/**
 * Downloads the knowledge base from its official sources (kb/sources.json)
 * into kb/documents/<id>.md, main content only, as Markdown, with its URL,
 * publisher, retrieval date and a content hash in the front matter.
 *
 *   npm run kb:fetch            every source
 *   npm run kb:fetch -- <id>    one source
 *
 * Refuses any URL (or redirect) outside who.int and nafdac.gov.ng. The
 * documents are committed, so every change to what the assistant knows is
 * reviewable in a diff. Then run `npm run kb:ingest`.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { z } from "zod";
import { VERIFIED_PUBLISHERS, verifiedDomain } from "../src/lib/verifiedSources.js";

const KB_DIR = fileURLToPath(new URL("../kb/", import.meta.url));
const USER_AGENT = "MedVerifyNG-KnowledgeBase/1.0 (+https://github.com/david-ohimai/medverify-ng)";
const MIN_WORDS = 80;

const manifestSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      url: z.url(),
      publisher: z.string(),
      topic: z.string(),
    })
  ),
});

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
// Embedded media and forms carry no text the assistant can use.
turndown.remove(["picture", "iframe", "script", "style", "form", "button", "svg"] as never);

/** A cell's text: its paragraphs and line breaks joined with "; ", whitespace collapsed. */
function cellText(cell: Element): string {
  const parts: string[] = [];
  const walk = (node: Node, buffer: string[]): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) buffer.push(child.textContent ?? "");
      else if (/^(P|DIV|BR|LI)$/.test((child as Element).tagName)) {
        const inner: string[] = [];
        walk(child, inner);
        parts.push(buffer.splice(0).join(""), inner.join(""));
      } else walk(child, buffer);
    }
  };
  const rest: string[] = [];
  walk(cell, rest);
  parts.push(rest.join(""));
  return parts
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("; ")
    .replace(/\|/g, "/");
}

// Tables keep their rows and columns (NAFDAC alerts put original vs counterfeit side by side).
turndown.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const rows = Array.from((node as Element).querySelectorAll("tr"))
      .map((row) => Array.from(row.querySelectorAll("th, td")).map(cellText))
      .filter((cells) => cells.some(Boolean));
    if (rows.length === 0) return "";
    const width = Math.max(...rows.map((cells) => cells.length));
    const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
    return `\n\n${line(rows[0]!)}\n| ${Array(width).fill("---").join(" | ")} |\n${rows.slice(1).map(line).join("\n")}\n\n`;
  },
});

function clean(markdown: string): string {
  return markdown
    // Images: the assistant reads text only (the page URL is kept for people).
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // Page furniture.
    .replace(/#{1,6} Was this helpful\?[\s\S]*$/, "")
    .replace(/^\s*\*{2,}\s*$/gm, "")
    .replace(/\[([^\]]*)\]\((?:javascript|mailto):[^)]*\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

async function fetchSource(source: z.infer<typeof manifestSchema>["sources"][number]): Promise<string> {
  const domain = verifiedDomain(source.url);
  if (!domain) throw new Error(`${source.url} is not on a verified site (${Object.keys(VERIFIED_PUBLISHERS).join(", ")})`);
  if (VERIFIED_PUBLISHERS[domain] !== source.publisher) {
    throw new Error(`publisher "${source.publisher}" doesn't match ${domain} (${VERIFIED_PUBLISHERS[domain]})`);
  }

  // Public sites throttle bursts: up to 3 tries, 5 s then 10 s apart.
  let response: Response | undefined;
  for (let attempt = 1; !response; attempt++) {
    try {
      response = await fetch(source.url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((resolve) => setTimeout(resolve, 5_000 * attempt));
    }
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // A redirect must stay on a verified site too.
  if (!verifiedDomain(response.url)) throw new Error(`redirected off the verified sites to ${response.url}`);

  const { document } = parseHTML(await response.text());
  const article = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
  if (!article?.content) throw new Error("no main content found");

  const body = clean(turndown.turndown(article.content));
  const words = body.split(/\s+/).length;
  if (words < MIN_WORDS) throw new Error(`only ${words} words extracted, check the page`);

  const title = (article.title ?? source.topic).replace(/\s+/g, " ").trim();
  const sha256 = createHash("sha256").update(body).digest("hex");
  const frontMatter = [
    "---",
    `id: ${source.id}`,
    `title: ${JSON.stringify(title)}`,
    `publisher: ${source.publisher}`,
    `url: ${source.url}`,
    `retrieved: ${new Date().toISOString().slice(0, 10)}`,
    `sha256: ${sha256}`,
    "---",
  ].join("\n");

  writeFileSync(join(KB_DIR, "documents", `${source.id}.md`), `${frontMatter}\n\n# ${title}\n\n${body}\n`);
  return `${words} words`;
}

async function main(): Promise<void> {
  const { sources } = manifestSchema.parse(JSON.parse(readFileSync(join(KB_DIR, "sources.json"), "utf8")));
  const only = process.argv[2];
  const selected = only ? sources.filter((source) => source.id === only) : sources;
  if (selected.length === 0) throw new Error(`No source with id "${only}"`);
  mkdirSync(join(KB_DIR, "documents"), { recursive: true });

  let failed = 0;
  for (const source of selected) {
    try {
      console.log(`✓ ${source.id.padEnd(26)} ${await fetchSource(source)}`);
    } catch (err) {
      failed++;
      console.error(`✗ ${source.id.padEnd(26)} ${(err as Error).message}`);
    }
    // Be polite to public servers.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  console.log(`\n${selected.length - failed} of ${selected.length} fetched into kb/documents/. Review the diff, then: npm run kb:ingest`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error("kb:fetch failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
