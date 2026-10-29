import { prisma } from "../lib/prisma.js";

const promptSelect = {
  id: true,
  task: true,
  version: true,
  system: true,
  notes: true,
  isActive: true,
  createdAt: true,
} as const;

export const promptRepository = {
  findActive(task: string) {
    return prisma.promptVersion.findFirst({ where: { task, isActive: true }, select: promptSelect });
  },

  findById(id: string) {
    return prisma.promptVersion.findUnique({ where: { id }, select: promptSelect });
  },

  list(task?: string) {
    return prisma.promptVersion.findMany({
      ...(task ? { where: { task } } : {}),
      select: promptSelect,
      orderBy: [{ task: "asc" }, { version: "desc" }],
    });
  },

  /** Adds the next version number for the task. Not active until activated. */
  create(task: string, system: string, notes: string | null) {
    return prisma.$transaction(async (tx) => {
      const latest = await tx.promptVersion.aggregate({ where: { task }, _max: { version: true } });
      return tx.promptVersion.create({
        data: { task, system, notes, version: (latest._max.version ?? 0) + 1 },
        select: promptSelect,
      });
    });
  },

  /** Exactly one active version per task: switch both in one transaction. */
  activate(id: string, task: string) {
    return prisma.$transaction(async (tx) => {
      await tx.promptVersion.updateMany({ where: { task, isActive: true }, data: { isActive: false } });
      return tx.promptVersion.update({ where: { id }, data: { isActive: true }, select: promptSelect });
    });
  },

  /** Seed helper: insert a built-in version if missing; activate it only if the task has no active version. */
  async ensure(task: string, version: number, system: string, notes: string) {
    await prisma.promptVersion.upsert({
      where: { task_version: { task, version } },
      create: { task, version, system, notes },
      update: {},
    });
    const active = await prisma.promptVersion.count({ where: { task, isActive: true } });
    if (active === 0) {
      await prisma.promptVersion.update({ where: { task_version: { task, version } }, data: { isActive: true } });
    }
  },
};

export type PromptRecord = NonNullable<Awaited<ReturnType<typeof promptRepository.findById>>>;
