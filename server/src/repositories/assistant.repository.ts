import type { Prisma } from "../generated/prisma/client.js";
import type { AssistantMessageRole, DeviceRole } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";

export const assistantRepository = {
  createConversation(deviceId: string, role: DeviceRole) {
    return prisma.assistantConversation.create({ data: { deviceId, role }, select: { id: true } });
  },

  /** Only the device's own conversation. */
  findConversation(id: string, deviceId: string) {
    return prisma.assistantConversation.findFirst({ where: { id, deviceId }, select: { id: true, role: true, createdAt: true } });
  },

  /** The last N user/assistant turns, oldest first, what the model sees as history. */
  async recentTurns(conversationId: string, limit: number) {
    const rows = await prisma.assistantMessage.findMany({
      where: { conversationId, role: { in: ["user", "assistant"] } },
      select: { role: true, content: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.reverse();
  },

  /** The full transcript, including the tool trace. */
  listMessages(conversationId: string) {
    return prisma.assistantMessage.findMany({
      where: { conversationId },
      select: { id: true, role: true, content: true, toolName: true, toolArgs: true, toolResultSummary: true, citations: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  },

  async addMessage(data: {
    conversationId: string;
    role: AssistantMessageRole;
    content: string;
    toolName?: string;
    toolArgs?: Prisma.InputJsonValue;
    toolResultSummary?: string;
    citations?: Prisma.InputJsonValue;
  }) {
    await prisma.$transaction([
      prisma.assistantMessage.create({ data, select: { id: true } }),
      prisma.assistantConversation.update({ where: { id: data.conversationId }, data: { updatedAt: new Date() } }),
    ]);
  },
};
