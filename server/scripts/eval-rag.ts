/**
 * Retrieval eval (eval/rag-cases.json): does knowledge search find the
 * official document that answers each question, and nothing for off-topic
 * ones? Reports hit@1, recall@3, MRR and off-topic precision, and writes
 * eval/results/rag-latest.{json,md}.
 *
 *   npm run eval:rag      (needs npm run kb:ingest; 1 embedding call per question)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { knowledgeService } from "../src/services/knowledge/knowledge.service.js";
import "../src/events/index.js";

const EVAL_DIR = fileURLToPath(new URL("../eval/", import.meta.url));

async function main(): Promise<void> {
  const { cases } = z
    .object({ cases: z.array(z.object({ question: z.string(), expect: z.array(z.string()) })) })
    .parse(JSON.parse(readFileSync(join(EVAL_DIR, "rag-cases.json"), "utf8")));

  const results = [];
  for (const c of cases) {
    const { mode, passages } = await knowledgeService.search(c.question, 5);
    // Distinct documents in rank order.
    const documents = [...new Set(passages.map((p) => p.documentId))];
    const rank = documents.findIndex((id) => c.expect.includes(id)) + 1; // 0 = not found
    const offTopic = c.expect.length === 0;
    const passed = offTopic ? documents.length === 0 : rank >= 1 && rank <= 3;
    results.push({ question: c.question, offTopic, documents: documents.slice(0, 3), rank, mode, passed });
    console.log(`${passed ? "✓" : "✗"} ${c.question.slice(0, 70).padEnd(70)} ${offTopic ? `(off-topic) ${documents.length} returned` : rank ? `rank ${rank}` : "NOT FOUND"}`);
  }

  const onTopic = results.filter((r) => !r.offTopic);
  const offTopic = results.filter((r) => r.offTopic);
  const summary = {
    ranAt: new Date().toISOString(),
    questions: onTopic.length,
    hitAt1: `${onTopic.filter((r) => r.rank === 1).length} / ${onTopic.length}`,
    recallAt3: `${onTopic.filter((r) => r.rank >= 1 && r.rank <= 3).length} / ${onTopic.length}`,
    mrr: Math.round((onTopic.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0) / onTopic.length) * 100) / 100,
    offTopicRejected: `${offTopic.filter((r) => r.passed).length} / ${offTopic.length}`,
    mode: results.some((r) => r.mode === "keyword") ? "keyword fallback used" : "hybrid",
  };
  console.log(`\nhit@1 ${summary.hitAt1} · recall@3 ${summary.recallAt3} · MRR ${summary.mrr} · off-topic rejected ${summary.offTopicRejected}`);

  mkdirSync(join(EVAL_DIR, "results"), { recursive: true });
  writeFileSync(join(EVAL_DIR, "results", "rag-latest.json"), JSON.stringify({ summary, results }, null, 2));
  writeFileSync(
    join(EVAL_DIR, "results", "rag-latest.md"),
    [
      `# Retrieval eval, ${summary.ranAt}`,
      "",
      `hit@1 **${summary.hitAt1}** · recall@3 **${summary.recallAt3}** · MRR **${summary.mrr}** · off-topic questions with nothing returned **${summary.offTopicRejected}** (${summary.mode})`,
      "",
      "| Question | Result | Top documents |",
      "|---|---|---|",
      ...results.map((r) => `| ${r.question} | ${r.passed ? "✓" : "✗"} ${r.offTopic ? "off-topic" : r.rank ? `rank ${r.rank}` : "not found"} | ${r.documents.join(", ") || "—"} |`),
      "",
    ].join("\n")
  );
  console.log("Wrote eval/results/rag-latest.json and rag-latest.md");
}

main()
  .catch((err: unknown) => {
    console.error("RAG eval failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  });
