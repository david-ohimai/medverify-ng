/**
 * Agent eval (eval/agent-cases.json): runs each question through the real
 * assistant (real AI, real tools, real knowledge base) as a throwaway
 * device, and checks tool choice, citations and exact details.
 *
 *   npm run eval:agent
 *
 * Writes eval/results/agent-latest.{json,md}. Needs the seed, the
 * knowledge base (npm run kb:ingest) and, for the hotspot cases, npm run simulate.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { llmService } from "../src/ai/llm.service.js";
import { sha256 } from "../src/lib/hash.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { assistantService, type AssistantEvent } from "../src/services/assistant/assistant.service.js";
import "../src/events/index.js";

const EVAL_DIR = fileURLToPath(new URL("../eval/", import.meta.url));

const caseSchema = z.object({
  id: z.string(),
  role: z.enum(["public", "regulator"]),
  question: z.string(),
  mustCall: z.array(z.string()).default([]),
  mustNotCall: z.array(z.string()).default([]),
  mustCite: z.boolean(),
  answerContains: z.array(z.string()),
});

async function main(): Promise<void> {
  if (!llmService.configured) throw new Error("No AI provider configured — set GEMINI_API_KEY");
  const { cases } = z.object({ cases: z.array(caseSchema) }).parse(JSON.parse(readFileSync(join(EVAL_DIR, "agent-cases.json"), "utf8")));

  // A throwaway device for the run; deleted at the end (its conversations cascade).
  const device = await prisma.device.create({
    data: { installIdHash: sha256(`eval-${randomUUID()}`), platform: "android", appVersion: "eval" },
    select: { id: true },
  });

  const results = [];
  try {
    for (const c of cases) {
      const started = Date.now();
      const events: AssistantEvent[] = [];
      for await (const event of assistantService.ask(device.id, c.role, { message: c.question })) events.push(event);

      const called = events.filter((e) => e.type === "tool_start").map((e) => (e as { name: string }).name);
      const answer = (events.find((e) => e.type === "answer") as { text: string } | undefined)?.text ?? "";
      const citations = (events.find((e) => e.type === "citations") as { citations: unknown[] } | undefined)?.citations ?? [];
      const error = events.find((e) => e.type === "error") as { code: string } | undefined;

      const problems: string[] = [];
      if (error) problems.push(`error ${error.code}`);
      for (const tool of c.mustCall) if (!called.includes(tool)) problems.push(`didn't call ${tool}`);
      for (const tool of c.mustNotCall) if (called.includes(tool)) problems.push(`called ${tool}`);
      if (c.mustCite && citations.length === 0) problems.push("no citation");
      for (const text of c.answerContains) if (!answer.toLowerCase().includes(text.toLowerCase())) problems.push(`answer lacks "${text}"`);

      const result = { id: c.id, passed: problems.length === 0, problems, called, citations: citations.length, ms: Date.now() - started, answer };
      results.push(result);
      console.log(`${result.passed ? "✓" : "✗"} ${c.id.padEnd(26)} tools: ${called.join(", ") || "—"}  ${result.ms} ms  ${problems.join("; ")}`);
      // The free tier allows only a few calls a minute.
      await new Promise((resolve) => setTimeout(resolve, 4_000));
    }
  } finally {
    await prisma.device.delete({ where: { id: device.id } });
  }

  const passed = results.filter((r) => r.passed).length;
  const toolChoice = cases.filter((c, i) => c.mustCall.every((t) => results[i]!.called.includes(t)) && c.mustNotCall.every((t) => !results[i]!.called.includes(t))).length;
  const needCite = cases.filter((c) => c.mustCite);
  const cited = needCite.filter((c) => results[cases.indexOf(c)]!.citations > 0).length;
  console.log(`\nPassed ${passed} / ${cases.length} · right tools ${toolChoice} / ${cases.length} · cited when required ${cited} / ${needCite.length}`);

  mkdirSync(join(EVAL_DIR, "results"), { recursive: true });
  writeFileSync(join(EVAL_DIR, "results", "agent-latest.json"), JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
  writeFileSync(
    join(EVAL_DIR, "results", "agent-latest.md"),
    [
      `# Agent eval — ${new Date().toISOString()}`,
      "",
      `Passed **${passed} / ${cases.length}** · right tools **${toolChoice} / ${cases.length}** · cited official sources when required **${cited} / ${needCite.length}**`,
      "",
      "| Case | Result | Tools called | Citations | ms |",
      "|---|---|---|---|---|",
      ...results.map((r) => `| ${r.id} | ${r.passed ? "✓" : `✗ ${r.problems.join("; ")}`} | ${r.called.join(", ") || "—"} | ${r.citations} | ${r.ms} |`),
      "",
    ].join("\n")
  );
  console.log("Wrote eval/results/agent-latest.json and agent-latest.md");
}

main()
  .catch((err: unknown) => {
    console.error("Agent eval failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    llmService.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  });
