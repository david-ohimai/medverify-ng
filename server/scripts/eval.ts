/**
 * Golden eval set for the photo pipeline (eval/cases.json).
 *
 *   npm run eval              answers cached by photo hash are reused (costs no quota)
 *   npm run eval -- --fresh   clears each case's cached AI answers first (real calls, real latency)
 *
 * Runs exactly what the queue worker runs (analysePhoto) against the real
 * database, Redis and AI providers, but saves no scans. Reports pass rate,
 * verdict accuracy, the safety metric that matters most, fakes passed as
 * "likely genuine", false alarms, field-reading accuracy and latency, and
 * writes eval/results/latest.{json,md} (fresh runs) or cached.{json,md}. Exits 1 if any fake passed as genuine.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { llmService } from "../src/ai/llm.service.js";
import { cacheDelPattern } from "../src/lib/cache.js";
import { AppError } from "../src/lib/errors.js";
import { prepareImage } from "../src/lib/image.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { analysePhoto } from "../src/services/photoScan.service.js";
import "../src/events/index.js";

const EVAL_DIR = fileURLToPath(new URL("../eval/", import.meta.url));
const fresh = process.argv.includes("--fresh");

const verdict = z.enum(["likely_genuine", "suspicious", "high_risk", "unregistered"]);
const caseSchema = z.object({
  id: z.string(),
  image: z.string(),
  description: z.string(),
  expect: z.object({
    verdict: z.array(verdict).optional(),
    failure: z.string().optional(),
    nafdacNo: z.string().optional(),
    batchNo: z.string().optional(),
    /** Every one of these signals must be present. */
    signals: z.array(z.string()).optional(),
    /** At least one of these must be present. */
    anySignal: z.array(z.string()).optional(),
  }),
});
type EvalCase = z.infer<typeof caseSchema>;

interface CaseResult {
  id: string;
  description: string;
  passed: boolean;
  problems: string[];
  verdict: string | null;
  riskScore: number | null;
  confidence: string | null;
  failure: string | null;
  signals: string[];
  nafdacNo: string | null;
  batchNo: string | null;
  provider: string | null;
  ms: number;
  expectedGenuine: boolean | null;
}

async function runCase(c: EvalCase): Promise<CaseResult> {
  const image = await prepareImage(readFileSync(join(EVAL_DIR, c.image)));
  if (fresh) {
    await cacheDelPattern(`ai:label:${image.hash}:*`);
    await cacheDelPattern(`ai:compare:${image.hash}:*`);
  }

  const started = Date.now();
  const result: CaseResult = {
    id: c.id,
    description: c.description,
    passed: false,
    problems: [],
    verdict: null,
    riskScore: null,
    confidence: null,
    failure: null,
    signals: [],
    nafdacNo: null,
    batchNo: null,
    provider: null,
    ms: 0,
    expectedGenuine: c.expect.verdict ? c.expect.verdict.every((v) => v === "likely_genuine") : null,
  };

  try {
    const analysis = await analysePhoto({ hash: image.hash, data: image.data }, async () => undefined);
    if (analysis.outcome === "rejected") {
      result.failure = analysis.code;
    } else {
      result.verdict = analysis.assessment.verdict;
      result.riskScore = analysis.assessment.riskScore;
      result.confidence = analysis.assessment.confidence;
      result.signals = analysis.signals.map((signal) => signal.code);
      result.nafdacNo = analysis.facts.nafdacNo;
      result.batchNo = analysis.facts.batchNo;
      result.provider = analysis.llmProvider;
    }
  } catch (err) {
    result.failure = err instanceof AppError ? err.code : `ERROR: ${(err as Error).message}`;
  }
  result.ms = Date.now() - started;

  const { expect } = c;
  const problems = result.problems;
  if (expect.failure && result.failure !== expect.failure) problems.push(`expected failure ${expect.failure}, got ${result.failure ?? result.verdict}`);
  if (expect.verdict && !expect.verdict.includes(result.verdict as never)) {
    problems.push(`expected ${expect.verdict.join(" or ")}, got ${result.verdict ?? result.failure}`);
  }
  if (expect.nafdacNo && result.nafdacNo !== expect.nafdacNo) problems.push(`read NAFDAC ${result.nafdacNo}, expected ${expect.nafdacNo}`);
  if (expect.batchNo && result.batchNo !== expect.batchNo) problems.push(`read batch ${result.batchNo}, expected ${expect.batchNo}`);
  for (const code of expect.signals ?? []) if (!result.signals.includes(code)) problems.push(`missing signal ${code}`);
  if (expect.anySignal && !expect.anySignal.some((code) => result.signals.includes(code))) {
    problems.push(`expected one of ${expect.anySignal.join(", ")}`);
  }
  result.passed = problems.length === 0;
  return result;
}

const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((100 * n) / d)}%`);

async function main(): Promise<void> {
  if (!llmService.configured) throw new Error("No AI provider configured, set GEMINI_API_KEY in server/.env");
  const { cases } = z.object({ cases: z.array(caseSchema) }).parse(JSON.parse(readFileSync(join(EVAL_DIR, "cases.json"), "utf8")));

  console.log(`Running ${cases.length} eval cases${fresh ? " (fresh: no cached AI answers)" : ""}…\n`);
  const results: CaseResult[] = [];
  // One at a time: the free tier is rate-limited per minute.
  for (const c of cases) {
    const result = await runCase(c);
    results.push(result);
    const outcome = result.verdict ? `${result.verdict} (${result.riskScore}, ${result.confidence})` : result.failure;
    console.log(`${result.passed ? "✓" : "✗"} ${c.id.padEnd(22)} ${String(outcome).padEnd(34)} ${String(result.ms).padStart(6)} ms  ${result.problems.join("; ")}`);
  }

  const withVerdict = cases.filter((c) => c.expect.verdict);
  const verdictCorrect = results.filter((r, i) => cases[i]!.expect.verdict?.includes(r.verdict as never));
  const fakes = results.filter((r) => r.expectedGenuine === false);
  const fakesPassed = fakes.filter((r) => r.verdict === "likely_genuine");
  const genuine = results.filter((r) => r.expectedGenuine === true);
  const falseAlarms = genuine.filter((r) => r.verdict !== null && r.verdict !== "likely_genuine");
  const fieldChecks = cases.flatMap((c, i) => [
    ...(c.expect.nafdacNo ? [results[i]!.nafdacNo === c.expect.nafdacNo] : []),
    ...(c.expect.batchNo ? [results[i]!.batchNo === c.expect.batchNo] : []),
  ]);
  const live = results.filter((r) => r.provider && r.provider !== "cache");
  const summary = {
    ranAt: new Date().toISOString(),
    fresh,
    cases: cases.length,
    passed: results.filter((r) => r.passed).length,
    verdictAccuracy: pct(verdictCorrect.length, withVerdict.length),
    fakesPassedAsGenuine: `${fakesPassed.length} of ${fakes.length}`,
    falseAlarms: `${falseAlarms.length} of ${genuine.length}`,
    fieldAccuracy: pct(fieldChecks.filter(Boolean).length, fieldChecks.length),
    medianLatencyMs: [...results.map((r) => r.ms)].sort((a, b) => a - b)[Math.floor(results.length / 2)],
    liveAiCases: live.length,
  };

  console.log(`
Passed                    ${summary.passed} / ${summary.cases}
Verdict accuracy          ${summary.verdictAccuracy}
Fakes passed as genuine   ${summary.fakesPassedAsGenuine}   ← must be 0
False alarms on genuine   ${summary.falseAlarms}
Field reading accuracy    ${summary.fieldAccuracy}
Median latency            ${summary.medianLatencyMs} ms (${summary.liveAiCases} case(s) with live AI calls)`);

  // Only a fresh run measures real AI latency, so cached runs don't overwrite its report.
  const name = fresh ? "latest" : "cached";
  mkdirSync(join(EVAL_DIR, "results"), { recursive: true });
  writeFileSync(join(EVAL_DIR, "results", `${name}.json`), JSON.stringify({ summary, results }, null, 2));
  writeFileSync(
    join(EVAL_DIR, "results", `${name}.md`),
    [
      `# Eval results, ${summary.ranAt}${fresh ? " (fresh)" : ""}`,
      "",
      "| Metric | Value |",
      "|---|---|",
      `| Passed | ${summary.passed} / ${summary.cases} |`,
      `| Verdict accuracy | ${summary.verdictAccuracy} |`,
      `| Fakes passed as genuine | ${summary.fakesPassedAsGenuine} |`,
      `| False alarms on genuine packs | ${summary.falseAlarms} |`,
      `| Field reading accuracy (NAFDAC no., batch) | ${summary.fieldAccuracy} |`,
      `| Median latency | ${summary.medianLatencyMs} ms |`,
      "",
      "| Case | Result | Verdict | Score | Confidence | Signals | ms |",
      "|---|---|---|---|---|---|---|",
      ...results.map(
        (r) =>
          `| ${r.id} | ${r.passed ? "✓" : `✗ ${r.problems.join("; ")}`} | ${r.verdict ?? r.failure} | ${r.riskScore ?? "—"} | ${r.confidence ?? "—"} | ${r.signals.join(", ")} | ${r.ms} |`
      ),
      "",
    ].join("\n")
  );
  console.log(`\nWrote eval/results/${name}.json and ${name}.md`);

  if (fakesPassed.length > 0) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error("Eval failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    llmService.shutdown();
    // Let the ai:called audit listeners finish writing before disconnecting.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  });
