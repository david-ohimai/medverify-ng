# Knowledge base, official sources only

The assistant's `search_guidance` tool answers from these documents and nothing else. Every one is an official page from the **World Health Organization (who.int)** or **NAFDAC (nafdac.gov.ng)**.

| Step | Command | What it does |
|---|---|---|
| 1 | Edit `sources.json` | Add or remove an official page (id, URL, publisher, topic) |
| 2 | `npm run kb:fetch` | Downloads each page's main content into `documents/<id>.md` with its URL, retrieval date and a content hash. Refuses any URL, or redirect, outside the two verified sites. Images and page furniture are dropped; tables are kept |
| 3 | Review the diff | Every change to what the assistant knows is a reviewable Git diff |
| 4 | `npm run kb:ingest` | Splits each document into passages, embeds them with Gemini (`gemini-embedding-001`, 768-d) and stores them in `kb_documents` / `kb_chunks` (pgvector). Unchanged documents are skipped; deleted files are removed. Refuses a document whose URL isn't verified |

The allowlist lives in `src/lib/verifiedSources.ts` and is checked three times: when fetching, when ingesting, and when returning search results. A unit test also checks every committed document.

Current sources (14): the WHO fact sheet and two WHO Q&As on substandard and falsified medical products; NAFDAC's pages on curbing SF medicines, the Mobile Authentication Service and the Greenbook; and eight NAFDAC public alerts (2024–2026) on falsified antimalarials, Postinor-2, oxytocin, Betaclox and chloroquine.

Pages change: re-run `kb:fetch` before the demo and check the `retrieved` dates.
