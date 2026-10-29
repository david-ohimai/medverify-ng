import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isVerifiedSource, verifiedDomain } from "../../src/lib/verifiedSources.js";
import type { KnowledgeHit } from "../../src/repositories/knowledge.repository.js";
import { chunkDocument, embeddingText, parseDocument } from "../../src/services/knowledge/chunker.js";
import { fuseRankings, keywordQuery } from "../../src/services/knowledge/knowledge.service.js";

const DOCS = fileURLToPath(new URL("../../kb/documents/", import.meta.url));

describe("verified sources", () => {
  it.each([
    ["https://www.who.int/news-room/fact-sheets/detail/x", "who.int"],
    ["https://nafdac.gov.ng/public-alert/", "nafdac.gov.ng"],
    ["https://www.nafdac.gov.ng/x", "nafdac.gov.ng"],
  ])("%s is verified (%s)", (url, domain) => {
    expect(verifiedDomain(url)).toBe(domain);
  });

  it.each([
    "http://www.who.int/x", // not HTTPS
    "https://who.int.evil.com/x", // look-alike host
    "https://evilwho.int/x", // suffix without a dot
    "https://nafdac.gov.ng.example.org/",
    "https://user:pass@nafdac.gov.ng/",
    "https://nafdac.gov.ng:8443/",
    "https://en.wikipedia.org/wiki/NAFDAC",
    "not a url",
  ])("%s is NOT verified", (url) => {
    expect(isVerifiedSource(url)).toBe(false);
  });

  it("every committed knowledge-base document comes from a verified site, under its own id", () => {
    const files = readdirSync(DOCS).filter((file) => file.endsWith(".md"));
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const file of files) {
      const { meta } = parseDocument(readFileSync(`${DOCS}${file}`, "utf8"));
      expect(isVerifiedSource(meta.url), `${file}: ${meta.url}`).toBe(true);
      expect(`${meta.id}.md`).toBe(file);
      expect(["World Health Organization", "NAFDAC"]).toContain(meta.publisher);
    }
  });
});

describe("chunker", () => {
  const doc = [
    "---",
    "id: test-doc",
    'title: "Test: a document"',
    "publisher: NAFDAC",
    "url: https://nafdac.gov.ng/test/",
    "retrieved: 2026-10-29",
    "sha256: abc",
    "---",
    "",
    "# Heading one",
    "",
    "A".repeat(500),
    "",
    "B".repeat(500),
    "",
    "## Product details",
    "",
    "| Batch | Expiry |\n| --- | --- |\n| T36184B | 08/2028 |",
  ].join("\n");

  it("parses the front matter (quoted titles included) and refuses a document without it", () => {
    const { meta, body } = parseDocument(doc);
    expect(meta).toMatchObject({ id: "test-doc", title: "Test: a document", url: "https://nafdac.gov.ng/test/" });
    expect(body.startsWith("# Heading one")).toBe(true);
    expect(() => parseDocument("# no front matter")).toThrow(/front matter/);
  });

  it("splits at headings, packs paragraphs up to ~900 chars with one paragraph of overlap, keeps tables whole", () => {
    const chunks = chunkDocument(parseDocument(doc).body);
    expect(chunks.map((c) => c.section)).toEqual(["Heading one", "Heading one", "Product details"]);
    expect(chunks[0]!.content).toBe("A".repeat(500));
    expect(chunks[1]!.content).toBe(`${"A".repeat(500)}\n\n${"B".repeat(500)}`);
    expect(chunks[2]!.content).toContain("| T36184B | 08/2028 |");
    expect(chunks.map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it("embeds a passage with its title and section, so it stands on its own", () => {
    const text = embeddingText({ title: "Alert 027", publisher: "NAFDAC" }, { position: 0, section: "Details", content: "Batch T36184B" });
    expect(text).toBe("Alert 027 (NAFDAC)\nDetails\nBatch T36184B");
  });
});

describe("hybrid retrieval helpers", () => {
  const hit = (chunkId: string): KnowledgeHit => ({
    chunkId,
    documentId: "d",
    title: "t",
    publisher: "NAFDAC",
    url: "https://nafdac.gov.ng/",
    retrieved: new Date(),
    section: null,
    content: chunkId,
    score: 0,
  });

  it("a question becomes an any-word keyword query, codes kept", () => {
    expect(keywordQuery("Is Postinor batch T36184B fake?")).toBe("postinor or batch or t36184b or fake");
    expect(keywordQuery("a b ?")).toBe("");
  });

  it("Reciprocal Rank Fusion favours passages both searches found", () => {
    const fused = fuseRankings([[hit("a"), hit("b"), hit("c")], [hit("c"), hit("d")]], 3);
    expect(fused.map((h) => h.chunkId)).toEqual(["c", "a", "b"]);
  });
});
