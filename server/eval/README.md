# Golden eval set — photo pipeline

`cases.json` lists photos in `fixtures/` and what the pipeline must conclude about each. `npm run eval` runs every case through exactly the code the scan worker runs (`analysePhoto`: read the label → registry → batch → compare with the genuine pack → score), against the real database, Redis and AI providers, and saves no scans.

```bash
npm run seed              # demo registry rows + the Demoquine reference photo
npm run eval              # reuses cached AI answers — free, instant, checks the rules
npm run eval -- --fresh   # real AI calls (≈2 per case) — real accuracy and latency
```

Reported:

| Metric | Why it matters |
|---|---|
| Fakes passed as genuine | **The safety metric.** A fake called "likely genuine" is the one mistake that hurts someone. Must be 0; the script exits 1 otherwise |
| False alarms on genuine packs | Too many and people stop trusting the app |
| Verdict accuracy | Expected verdict (or one of the accepted ones) |
| Field reading accuracy | NAFDAC number and batch read exactly |
| Median latency | Fresh runs only; includes rate-limit waits and fallbacks |

Fresh runs write `results/latest.md` (committed, used in the slides); cached runs write `results/cached.md` (ignored).

## The cases

The current fixtures are **drawn**, fictional demo packs (`npm run demo-images`, X9- numbers, "DEMO PROP" on every one): genuine, recalled batch, expired batch, altered label (misspellings, wrong logo, off colour, different font), a real number on a different product, an unregistered number, a product with no reference photo, and a photo that isn't a pack. They prove the whole pipeline end to end without real photos.

## Adding real packs

1. Photograph the pack (a normal phone photo, at an angle, like a user would).
2. Put it in `fixtures/`, e.g. `fixtures/coartem-genuine-1.jpg`.
3. Make sure its product (and batch, if you know it) is in `prisma/seed/data/products.csv` / `batches.csv`, and a straight-on photo of the genuine pack is in `prisma/seed/reference/<NAFDAC no>/`.
4. Add a case:
   ```json
   { "id": "coartem-genuine-1", "image": "fixtures/coartem-genuine-1.jpg",
     "description": "Genuine Coartem bought at a pharmacy",
     "expect": { "verdict": ["likely_genuine"], "nafdacNo": "A4-1234", "batchNo": "LT2391" } }
   ```
   `expect` takes `verdict` (accepted verdicts), `failure` (e.g. `NOT_A_MEDICINE_PACK`), `nafdacNo`, `batchNo`, `signals` (all required) and `anySignal` (at least one).
5. `npm run seed && npm run eval -- --fresh`.

## Retrieval eval

`npm run eval:rag` asks the knowledge search the questions in `rag-cases.json` and checks that the official document holding the answer ranks first (hit@1) or in the top three (recall@3), and that off-topic questions return nothing. Results: `results/rag-latest.md`.

## Everything in one page

`npm run eval:report` combines the photo, retrieval and assistant results with live reviewer agreement into `docs/eval-results.md`.

## Agent eval

`npm run eval:agent` asks the assistant the questions in `agent-cases.json` (public and regulator) and checks that it calls the right tools, cites official sources when it should, quotes exact details (e-mail addresses, batch numbers) and stays in scope. Results: `results/agent-latest.md`.

Free-tier quotas are small: run fresh once per real change (a prompt or rule change), not in a loop.
