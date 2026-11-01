/**
 * Loads kb/documents/*.md into the knowledge base: chunk → embed (Gemini,
 * 768-d) → kb_documents + kb_chunks. Idempotent: an unchanged document
 * (same sha256) is skipped, a changed one is replaced, a deleted file is
 * removed. Refuses any document whose URL isn't on a verified site.
 *
 *   npm run kb:ingest
 *   npm run kb:ingest -- --force   re-embed everything
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { embed, toVectorLiteral } from "../src/ai/embeddings.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { VERIFIED_PUBLISHERS, verifiedDomain } from "../src/lib/verifiedSources.js";
import { knowledgeRepository } from "../src/repositories/knowledge.repository.js";
import { chunkDocument, embeddingText, parseDocument } from "../src/services/knowledge/chunker.js";
import "../src/events/index.js";

const DOCS_DIR = fileURLToPath(new URL("../kb/documents/", import.meta.url));
const force = process.argv.includes("--force");

/**
 * The free tier limits embeddings per minute (each passage counts), so a
 * full ingest can hit it. Wait for the minute to roll over and try again.
 */
async function embedPolitely(texts: string[], id: string): Promise<number[][]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await embed(texts, "RETRIEVAL_DOCUMENT");
    } catch (err) {
      if (attempt >= 4) throw err;
      console.log(`  ${id}: rate-limited, waiting 65 s (attempt ${attempt} of 3)…`);
      await new Promise((resolve) => setTimeout(resolve, 65_000));
    }
  }
}

async function main(): Promise<void> {
  const files = readdirSync(DOCS_DIR).filter((file) => file.endsWith(".md")).sort();
  const stored = new Map((await knowledgeRepository.listDocuments()).map((doc) => [doc.id, doc.sha256]));
  const seen = new Set<string>();
  let embedded = 0;
  let skipped = 0;

  for (const file of files) {
    const { meta, body } = parseDocument(readFileSync(join(DOCS_DIR, file), "utf8"));
    const domain = verifiedDomain(meta.url);
    if (!domain || VERIFIED_PUBLISHERS[domain] !== meta.publisher) {
      throw new Error(`${file}: ${meta.url} (${meta.publisher}) is not a verified source, refusing to ingest anything`);
    }
    if (`${meta.id}.md` !== file) throw new Error(`${file}: id "${meta.id}" doesn't match the file name`);
    seen.add(meta.id);

    if (!force && stored.get(meta.id) === meta.sha256) {
      skipped++;
      continue;
    }
    const chunks = chunkDocument(body);
    const vectors = await embedPolitely(chunks.map((chunk) => embeddingText(meta, chunk)), meta.id);
    await knowledgeRepository.replaceDocument(
      { id: meta.id, title: meta.title, publisher: meta.publisher, url: meta.url, retrieved: new Date(meta.retrieved), sha256: meta.sha256 },
      chunks.map((chunk, i) => ({ ...chunk, vector: toVectorLiteral(vectors[i]!) }))
    );
    embedded++;
    console.log(`✓ ${meta.id.padEnd(26)} ${chunks.length} passages`);
  }

  const removed = [...stored.keys()].filter((id) => !seen.has(id));
  if (removed.length > 0) await knowledgeRepository.deleteDocuments(removed);

  const counts = await knowledgeRepository.counts();
  console.log(
    `\nKnowledge base: ${counts.documents} documents, ${counts.chunks} passages ` +
      `(${embedded} embedded, ${skipped} unchanged, ${removed.length} removed).`
  );
}

main()
  .catch((err: unknown) => {
    console.error("kb:ingest failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  });
