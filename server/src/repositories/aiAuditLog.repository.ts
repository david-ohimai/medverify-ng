import { prisma } from "../lib/prisma.js";

export interface AiAuditEntry {
  task: string;
  provider: string;
  model: string;
  promptVersion: number | null;
  success: boolean;
  errorCode: string | null;
  fallbackUsed: boolean;
  inputSummary: string;
  outputSummary: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  scanId: string | null;
  correlationId: string | null;
}

export const aiAuditLogRepository = {
  create(entry: AiAuditEntry) {
    return prisma.aiAuditLog.create({ data: entry, select: { id: true } });
  },

  listRecent(limit: number, task?: string) {
    return prisma.aiAuditLog.findMany({
      ...(task ? { where: { task } } : {}),
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  /** Per provider/model since a point in time: calls, failures, fallbacks, tokens, average latency. */
  async usageSince(since: Date) {
    const rows = await prisma.aiAuditLog.groupBy({
      by: ["provider", "model", "success"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
      _avg: { latencyMs: true },
    });
    const fallbacks = await prisma.aiAuditLog.count({ where: { createdAt: { gte: since }, fallbackUsed: true, success: true } });
    return { rows, fallbacks };
  },
};
