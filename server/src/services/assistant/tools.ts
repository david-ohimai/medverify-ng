import { z } from "zod";
import type { DeviceRole } from "../../generated/prisma/enums.js";
import { AREAS } from "../../lib/areas.js";
import { parseExpiry, todayUtc } from "../../lib/dates.js";
import { isValidNafdacNo, normalizeBatchNo, normalizeNafdacNo } from "../../lib/nafdac.js";
import { productRepository } from "../../repositories/product.repository.js";
import { hotspotService, STATS_WINDOWS, type StatsWindow } from "../hotspot/hotspot.service.js";
import { knowledgeService } from "../knowledge/knowledge.service.js";
import { registryService } from "../registry.service.js";
import { adviceFor } from "../risk/riskScorer.js";
import { scanService } from "../scan.service.js";
import { checkAgainstRegistry } from "../verification.service.js";

/**
 * The assistant's tools. The model never writes SQL or touches the
 * database: it picks a tool and fills in arguments; the arguments are
 * validated with Zod; the tool runs fixed, parameterised, READ-ONLY
 * queries through the normal services; and the device's role decides which
 * tools exist at all. Results are trimmed before the model sees them.
 */

export interface Citation {
  n: number;
  title: string;
  publisher: string;
  url: string;
  retrieved: string;
}

export interface ToolContext {
  deviceId: string;
  role: DeviceRole;
  /** Sources found so far in this answer; search_guidance numbers its passages after them. */
  citations: Citation[];
}

export interface ToolOutcome {
  /** What the model sees. */
  data: unknown;
  /** One line for the live trace and the transcript. */
  summary: string;
}

interface AssistantTool<S extends z.ZodObject> {
  name: string;
  description: string;
  roles: readonly DeviceRole[];
  schema: S;
  run(args: z.infer<S>, context: ToolContext): Promise<ToolOutcome>;
}

const tool = <S extends z.ZodObject>(definition: AssistantTool<S>) => definition;
const EVERYONE = ["public", "regulator"] as const;
const REGULATORS = ["regulator"] as const;

const demoNote = (source: string) => (source === "demo" ? "FICTIONAL DEMO RECORD, not a real NAFDAC registration" : undefined);
const dateOnly = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export const ASSISTANT_TOOLS = [
  tool({
    name: "search_guidance",
    description:
      "Search official WHO and NAFDAC documents (fake/substandard medicines, how to report them, NAFDAC public alerts and recalls, the Mobile Authentication Service, the Greenbook). Returns numbered passages with their source; cite them as [n].",
    roles: EVERYONE,
    schema: z.object({ query: z.string().min(3).max(300).describe("What to look for, in plain words") }),
    async run({ query }, context) {
      const result = await knowledgeService.search(query, 5);
      const passages = result.passages.map((passage) => {
        let citation = context.citations.find((c) => c.url === passage.url);
        if (!citation) {
          citation = {
            n: context.citations.length + 1,
            title: passage.title,
            publisher: passage.publisher,
            url: passage.url,
            retrieved: dateOnly(passage.retrieved)!,
          };
          context.citations.push(citation);
        }
        return { source: citation.n, title: passage.title, section: passage.section, text: passage.content.slice(0, 1_500) };
      });
      return {
        data: passages.length > 0 ? { passages } : { passages: [], note: "No official guidance found on this." },
        summary: `${passages.length} passage(s) from ${new Set(passages.map((p) => p.source)).size} official source(s)${result.mode === "keyword" ? " (keyword search)" : ""}`,
      };
    },
  }),

  tool({
    name: "search_registry",
    description: "Find registered medicines by brand or generic name (fuzzy) or by the start of a NAFDAC number.",
    roles: EVERYONE,
    schema: z.object({ query: z.string().min(2).max(100) }),
    async run({ query }) {
      const hits = await registryService.search(query, 5);
      return {
        data: hits.map((hit) => ({
          nafdacNo: hit.nafdacNo,
          brandName: hit.brandName,
          genericName: hit.genericName,
          strength: hit.strength,
          manufacturer: hit.manufacturer,
          registrationStatus: hit.status,
          note: demoNote(hit.source),
        })),
        summary: `${hits.length} product(s) found`,
      };
    },
  }),

  tool({
    name: "check_product",
    description:
      "Check a NAFDAC registration number against the register, optionally with the product name, batch number and expiry printed on the pack. Returns the same verdict and reasons as a typed-in check.",
    roles: EVERYONE,
    schema: z.object({
      nafdacNo: z.string().min(4).max(60).describe("As printed, e.g. A4-1234"),
      productName: z.string().min(2).max(200).optional(),
      batchNo: z.string().min(2).max(60).optional(),
      expiry: z.string().max(10).optional().describe("YYYY-MM"),
    }),
    async run(args) {
      const nafdacNo = normalizeNafdacNo(args.nafdacNo);
      if (!isValidNafdacNo(nafdacNo)) return { data: { error: `"${args.nafdacNo}" is not a valid NAFDAC number format` }, summary: "invalid number" };
      const check = await checkAgainstRegistry({
        nafdacNo,
        productName: args.productName ?? null,
        batchNo: args.batchNo ? normalizeBatchNo(args.batchNo) : null,
        expiry: args.expiry ? parseExpiry(args.expiry) : null,
        packNotSeen: true,
      });
      const { headline, advice } = adviceFor(check.assessment.verdict, check.signals);
      return {
        data: {
          nafdacNo,
          registeredProduct: check.productName,
          verdict: check.assessment.verdict,
          riskScore: check.assessment.riskScore,
          confidence: check.assessment.confidence,
          headline,
          advice,
          reasons: check.signals.map((signal) => signal.label + (signal.detail ? `, ${signal.detail}` : "")),
        },
        summary: `${nafdacNo}: ${check.assessment.verdict} (${check.assessment.riskScore})`,
      };
    },
  }),

  tool({
    name: "check_batch",
    description: "Look up a batch number in our batch records: which product it belongs to, its expiry, and whether it has been recalled. Our batch records are incomplete, also search NAFDAC alerts with search_guidance.",
    roles: EVERYONE,
    schema: z.object({ batchNo: z.string().min(2).max(60), nafdacNo: z.string().max(60).optional() }),
    async run(args) {
      const batchNo = normalizeBatchNo(args.batchNo);
      const wanted = args.nafdacNo ? normalizeNafdacNo(args.nafdacNo) : null;
      const today = todayUtc();
      const batches = (await productRepository.findBatchesByNo(batchNo)).filter((b) => !wanted || b.product.nafdacNo === wanted);
      return {
        data:
          batches.length === 0
            ? { batchNo, found: false, note: "Not in our batch records (they are incomplete, this alone is not a warning)." }
            : batches.map((b) => ({
                batchNo: b.batchNo,
                product: `${b.product.brandName} (${b.product.genericName})`,
                nafdacNo: b.product.nafdacNo,
                expiryDate: dateOnly(b.expiryDate),
                expired: b.expiryDate !== null && b.expiryDate < today,
                recalled: b.recalled,
                recallNote: b.recallNote,
                note: demoNote(b.product.source),
              })),
        summary: batches.length === 0 ? `${batchNo}: not in records` : `${batchNo}: ${batches.length} match(es)${batches.some((b) => b.recalled) ? ", RECALLED" : ""}`,
      };
    },
  }),

  tool({
    name: "my_recent_scans",
    description: "This user's own most recent checks and scans in MedVerify, with their verdicts.",
    roles: EVERYONE,
    schema: z.object({ limit: z.number().int().min(1).max(10).default(5) }),
    async run({ limit }, context) {
      // The device comes from the token, never from the model's arguments.
      const { items } = await scanService.listForDevice(context.deviceId, 1, limit);
      return {
        data: items.map((scan) => ({
          when: scan.checkedAt,
          kind: scan.kind,
          status: scan.status,
          verdict: scan.verdict,
          headline: scan.headline,
          nafdacNo: scan.input.nafdacNo,
          product: scan.product?.brandName ?? scan.input.productName,
          batchNo: scan.input.batchNo,
        })),
        summary: `${items.length} recent scan(s)`,
      };
    },
  }),

  tool({
    name: "alerts_near_area",
    description: `Current warnings (clusters of suspicious scans) near a market or city. Known areas: ${AREAS.map((a) => `${a.name} (${a.city})`).join(", ")}.`,
    roles: EVERYONE,
    schema: z.object({ area: z.string().min(2).max(80).describe("A market or city name") }),
    async run({ area }) {
      const needle = area.toLowerCase();
      const place = AREAS.find((a) => a.name.toLowerCase().includes(needle) || needle.includes(a.name.toLowerCase())) ??
        AREAS.find((a) => a.city.toLowerCase() === needle || needle.includes(a.city.toLowerCase()));
      if (!place) return { data: { error: `Unknown area "${area}"`, knownAreas: AREAS.map((a) => `${a.name}, ${a.city}`) }, summary: "unknown area" };
      const alerts = await hotspotService.nearby(place.latitude, place.longitude, 25);
      return { data: { area: `${place.name}, ${place.city}`, radiusKm: 25, alerts }, summary: `${alerts.length} warning(s) near ${place.name}` };
    },
  }),

  tool({
    name: "hotspot_overview",
    description: "Regulators: scan statistics and the active hotspots (clusters of suspicious scans) for a time window.",
    roles: REGULATORS,
    schema: z.object({ window: z.enum(Object.keys(STATS_WINDOWS) as [StatsWindow, ...StatsWindow[]]).default("7d") }),
    async run({ window }) {
      const [stats, hotspots] = await Promise.all([hotspotService.stats(window), hotspotService.listActive()]);
      return {
        data: {
          stats,
          hotspots: hotspots.map((h) => ({
            area: h.areaName,
            severity: h.severity,
            scans: h.scanCount,
            highRisk: h.highRiskCount,
            nafdacNo: h.nafdacNo,
            batchNo: h.batchNo,
            recallInvolved: h.recallInvolved,
            lastSeen: h.lastSeen,
            alert: h.latestAlert?.title ?? null,
            includesSimulatedData: h.includesSimulatedData,
          })),
        },
        summary: `${stats.scans} scans, ${hotspots.length} active hotspot(s) (${window})`,
      };
    },
  }),

  tool({
    name: "hotspot_alerts",
    description: "Regulators: the most recent hotspot alert cards with recommended actions.",
    roles: REGULATORS,
    schema: z.object({ limit: z.number().int().min(1).max(10).default(5) }),
    async run({ limit }) {
      const { items } = await hotspotService.listAlerts(1, limit);
      return {
        data: items.map((a) => ({
          title: a.title,
          body: a.body,
          recommendedAction: a.recommendedAction,
          severity: a.severity,
          area: a.hotspot.areaName,
          createdAt: a.createdAt,
          includesSimulatedData: a.hotspot.simulatedShare > 0,
        })),
        summary: `${items.length} alert(s)`,
      };
    },
  }),
] as const;

export type AssistantToolName = (typeof ASSISTANT_TOOLS)[number]["name"];

export function toolsFor(role: DeviceRole) {
  return ASSISTANT_TOOLS.filter((t) => (t.roles as readonly DeviceRole[]).includes(role));
}

/** JSON Schema of a tool's arguments, as the providers expect it. */
export function toolParameters(schema: z.ZodObject): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  return rest;
}

/**
 * Runs one tool call safely: unknown or forbidden tools and invalid
 * arguments become an error the model can read and correct, never an
 * exception, never a query.
 */
export async function runTool(name: string, rawArgs: Record<string, unknown>, context: ToolContext): Promise<ToolOutcome & { ok: boolean; args: unknown }> {
  const definition = toolsFor(context.role).find((t) => t.name === name);
  if (!definition) {
    return { ok: false, args: rawArgs, data: { error: `No tool called "${name}" is available.` }, summary: "unknown tool" };
  }
  const parsed = (definition.schema as z.ZodObject).safeParse(rawArgs);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(args)"}: ${i.message}`).join("; ");
    return { ok: false, args: rawArgs, data: { error: `Invalid arguments, ${issues}` }, summary: "invalid arguments" };
  }
  const outcome = await (definition.run as (args: unknown, context: ToolContext) => Promise<ToolOutcome>)(parsed.data, context);
  return { ok: true, args: parsed.data, ...outcome };
}
