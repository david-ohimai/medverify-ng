import { embed, toVectorLiteral } from "../../ai/embeddings.js";
import { logger } from "../../lib/logger.js";
import { isVerifiedSource } from "../../lib/verifiedSources.js";
import { knowledgeRepository, type KnowledgeHit } from "../../repositories/knowledge.repository.js";

/**
 * Below this cosine similarity a passage is about something else. Measured
 * on this knowledge base: off-topic questions score 0.52–0.57, real ones 0.61–0.77.
 */
export const MIN_VECTOR_SIMILARITY = 0.6;
/** Reciprocal Rank Fusion constant (the usual 60). */
const RRF_K = 60;
const CANDIDATES = 10;

export interface KnowledgeResult {
  /** "hybrid" = meaning + keywords; "keyword" = embeddings unavailable, keywords only. */
  mode: "hybrid" | "keyword";
  passages: Array<Omit<KnowledgeHit, "score" | "chunkId"> & { score: number }>;
}

/** "How do I report a fake drug?" → "report or fake or drug" (any word may match). */
export function keywordQuery(question: string): string {
  const words = question
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}/-]*/gu)
    ?.filter((word) => word.length >= 3 || /\d/.test(word));
  return [...new Set(words ?? [])].slice(0, 20).join(" or ");
}

/**
 * Reciprocal Rank Fusion: each list votes 1/(60 + rank) for its passages.
 * Combines meaning (embeddings) and exact terms (batch numbers, brand
 * names) without having to calibrate their scores against each other.
 */
export function fuseRankings(lists: KnowledgeHit[][], limit: number): KnowledgeHit[] {
  const fused = new Map<string, { hit: KnowledgeHit; score: number }>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const entry = fused.get(hit.chunkId) ?? { hit, score: 0 };
      entry.score += 1 / (RRF_K + rank + 1);
      fused.set(hit.chunkId, entry);
    });
  }
  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ hit, score }) => ({ ...hit, score }));
}

export const knowledgeService = {
  /**
   * Hybrid retrieval over the official WHO / NAFDAC documents. If the
   * embedding call fails (no key, quota, outage) it degrades to keyword
   * search instead of failing. Every passage carries its source for citation.
   */
  async search(question: string, limit = 5): Promise<KnowledgeResult> {
    const keywords = keywordQuery(question);
    const keywordHits = keywords ? await knowledgeRepository.searchByKeywords(keywords, CANDIDATES) : [];

    let vectorHits: KnowledgeHit[] = [];
    let mode: KnowledgeResult["mode"] = "hybrid";
    try {
      const [vector] = await embed([question], "RETRIEVAL_QUERY");
      vectorHits = (await knowledgeRepository.searchByVector(toVectorLiteral(vector!), CANDIDATES)).filter(
        (hit) => hit.score >= MIN_VECTOR_SIMILARITY
      );
    } catch (err) {
      mode = "keyword";
      logger.warn({ event: "knowledge:keyword-only", message: (err as Error).message }, "Embeddings unavailable; keyword search only");
    }

    // Keyword matching is loose ("any word"), so when meaning-search works, a passage it
    // didn't find counts only if the question has an exact code in it (a batch or
    // registration number). "Best jollof rice recipe" then finds nothing, correctly.
    const hasCode = /\d/.test(keywords);
    const relevantKeywordHits =
      mode === "hybrid" && !hasCode
        ? keywordHits.filter((hit) => vectorHits.some((v) => v.chunkId === hit.chunkId))
        : keywordHits;

    const passages = fuseRankings([vectorHits, relevantKeywordHits], limit)
      // Defence in depth: nothing from an unverified site is ever returned.
      .filter((hit) => isVerifiedSource(hit.url))
      .map(({ chunkId: _chunkId, ...hit }) => hit);
    return { mode, passages };
  },
};
