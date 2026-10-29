/**
 * Turns a knowledge-base document (kb/documents/<id>.md) into passages for
 * retrieval. Pure functions, unit-tested.
 *
 * Passages follow the document's own structure: split at headings, then
 * packed paragraph by paragraph up to ~900 characters, with the last
 * paragraph repeated at the start of the next passage so an answer that
 * straddles a boundary is still found. Tables are never split.
 */

export interface DocumentMeta {
  id: string;
  title: string;
  publisher: string;
  url: string;
  retrieved: string;
  sha256: string;
}

export interface Chunk {
  position: number;
  section: string | null;
  content: string;
}

const TARGET_CHARS = 900;
const MAX_CHARS = 1_600;
const REQUIRED: (keyof DocumentMeta)[] = ["id", "title", "publisher", "url", "retrieved", "sha256"];

export function parseDocument(text: string): { meta: DocumentMeta; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error("missing front matter");
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    meta[key] = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  }
  const missing = REQUIRED.filter((key) => !meta[key]);
  if (missing.length > 0) throw new Error(`front matter is missing ${missing.join(", ")}`);
  return { meta: meta as unknown as DocumentMeta, body: match[2]!.trim() };
}

/** Paragraphs, keeping a table (consecutive "|" lines) as one block. */
function blocks(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function chunkDocument(body: string): Chunk[] {
  const chunks: Chunk[] = [];
  let section: string | null = null;
  let current: string[] = [];

  const flush = (keepOverlap: boolean) => {
    if (current.length === 0) return;
    const content = current.join("\n\n");
    // Skip a chunk that is only the overlap carried over from the previous one.
    if (!(chunks.length > 0 && current.length === 1 && chunks.at(-1)!.content.endsWith(content))) {
      chunks.push({ position: chunks.length, section, content });
    }
    current = keepOverlap ? [current.at(-1)!] : [];
  };

  for (const block of blocks(body)) {
    const heading = /^#{1,6}\s+(.*)$/.exec(block);
    if (heading && !block.includes("\n")) {
      flush(false);
      section = heading[1]!.replace(/\*/g, "").trim();
      continue;
    }
    // A very long paragraph is split at sentence ends.
    const pieces =
      block.length > MAX_CHARS && !block.startsWith("|")
        ? block.split(/(?<=[.!?])\s+(?=[A-Z])/).reduce<string[]>((acc, sentence) => {
            const last = acc.at(-1);
            if (last !== undefined && last.length + sentence.length < TARGET_CHARS) acc[acc.length - 1] = `${last} ${sentence}`;
            else acc.push(sentence);
            return acc;
          }, [])
        : [block];
    for (const piece of pieces) {
      const size = current.reduce((n, part) => n + part.length + 2, 0);
      if (size > 0 && size + piece.length > TARGET_CHARS) flush(true);
      current.push(piece);
    }
  }
  flush(false);
  return chunks;
}

/** What is embedded: the passage with its document title and section, so it means something on its own. */
export function embeddingText(meta: Pick<DocumentMeta, "title" | "publisher">, chunk: Chunk): string {
  return [`${meta.title} (${meta.publisher})`, chunk.section, chunk.content].filter(Boolean).join("\n");
}
