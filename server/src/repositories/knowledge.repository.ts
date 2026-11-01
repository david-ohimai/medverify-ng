import { prisma } from "../lib/prisma.js";

export interface KnowledgeHit {
  chunkId: string;
  documentId: string;
  title: string;
  publisher: string;
  url: string;
  retrieved: Date;
  section: string | null;
  content: string;
  score: number;
}

export const knowledgeRepository = {
  listDocuments() {
    return prisma.kbDocument.findMany({ select: { id: true, sha256: true } });
  },

  /**
   * Replaces a document and all its passages in one transaction. Vectors go
   * through parameterised raw SQL: Prisma has no type for pgvector columns.
   */
  async replaceDocument(
    document: { id: string; title: string; publisher: string; url: string; retrieved: Date; sha256: string },
    chunks: Array<{ position: number; section: string | null; content: string; vector: string }>
  ): Promise<void> {
    await prisma.$transaction(
      async (tx) => {
        await tx.kbDocument.upsert({ where: { id: document.id }, create: document, update: document });
        await tx.kbChunk.deleteMany({ where: { documentId: document.id } });
        for (const chunk of chunks) {
          await tx.$executeRaw`
            INSERT INTO kb_chunks (id, document_id, position, section, content, embedding)
            VALUES (gen_random_uuid(), ${document.id}, ${chunk.position}, ${chunk.section}, ${chunk.content}, ${chunk.vector}::vector)`;
        }
      },
      { timeout: 60_000 }
    );
  },

  deleteDocuments(ids: string[]) {
    return prisma.kbDocument.deleteMany({ where: { id: { in: ids } } });
  },

  /** Nearest passages by cosine similarity (1 = same meaning). Exact scan: the knowledge base is small. */
  searchByVector(vector: string, limit: number) {
    return prisma.$queryRaw<KnowledgeHit[]>`
      SELECT c.id AS "chunkId", d.id AS "documentId", d.title, d.publisher, d.url, d.retrieved,
             c.section, c.content, (1 - (c.embedding <=> ${vector}::vector))::float8 AS score
      FROM kb_chunks c JOIN kb_documents d ON d.id = c.document_id
      WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${vector}::vector
      LIMIT ${limit}`;
  },

  /** Keyword passages by Postgres full-text rank, catches exact terms like batch numbers and brand names. */
  searchByKeywords(query: string, limit: number) {
    return prisma.$queryRaw<KnowledgeHit[]>`
      SELECT c.id AS "chunkId", d.id AS "documentId", d.title, d.publisher, d.url, d.retrieved,
             c.section, c.content,
             ts_rank(to_tsvector('english', d.title || ' ' || coalesce(c.section, '') || ' ' || c.content),
                     websearch_to_tsquery('english', ${query}))::float8 AS score
      FROM kb_chunks c JOIN kb_documents d ON d.id = c.document_id
      WHERE to_tsvector('english', d.title || ' ' || coalesce(c.section, '') || ' ' || c.content)
            @@ websearch_to_tsquery('english', ${query})
      ORDER BY score DESC
      LIMIT ${limit}`;
  },

  async counts() {
    const [documents, chunks] = await Promise.all([prisma.kbDocument.count(), prisma.kbChunk.count()]);
    return { documents, chunks };
  },
};
