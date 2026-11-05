# Registry data

The NAFDAC registry MedVerify checks against. Loaded with `npm run seed` (from `server/`).

| File | What | Committed |
|---|---|---|
| `products.demo.csv`, `batches.demo.csv` | **Fictional** rows (`source: demo`, `X9-` numbers, "MedVerify Demo Pharma (fictional)") covering every rule: valid, expired, recalled, cancelled registration. For development, tests and CI. | yes |
| `products.csv` | **Real** registrations from the public [NAFDAC Greenbook](https://greenbook.nafdac.gov.ng): 8,679 products. Written by `npm run registry:fetch`, then loaded by `npm run seed` | yes, public registry data |
| `batches.csv` | **Real** batches, collected by hand (create it from the template). The Greenbook doesn't list batches | yes |
| `*.template.csv` | Empty files with the right headers and instructions | yes |

## Refreshing the register

`npm run registry:fetch` downloads every Greenbook product, one page at a time with a pause, and replaces `products.csv`. Then run `npm run seed`. Records with no valid number are skipped, and a number listed twice keeps its active, newest row. Greenbook's `Active` becomes `active`; anything else becomes `expired`.

## Adding real data by hand

`npm run registry:fetch` replaces `products.csv`, so anything hand-added there is lost on the next fetch. Put hand-added products in a separate file such as `products.local.csv`.

1. `cp products.template.csv products.local.csv` and `cp batches.template.csv batches.csv`.
2. For each product, look it up on the NAFDAC Greenbook (https://greenbook.nafdac.gov.ng) or read it off a **genuine** pack, and add a row:

   | Column | Example | Notes |
   |---|---|---|
   | `nafdac_no` | `A4-1234` | Any printed form works; it's normalised |
   | `brand_name` | `Coartem` | |
   | `generic_name` | `Artemether/Lumefantrine` | |
   | `strength` | `20 mg/120 mg` | optional |
   | `dosage_form` | `Tablet` | optional |
   | `manufacturer` | `Novartis` | optional |
   | `status` | `active` | `active`, `expired` or `cancelled` |
   | `source` | `greenbook` | `greenbook`, `pack_label` or `nafdac_alert` |

3. Batches you know about (from packs you hold, or NAFDAC recall alerts) go in `batches.csv`: `nafdac_no, batch_no, mfg_date, expiry_date, recalled, recall_note, source`. Dates as `YYYY-MM` or `YYYY-MM-DD`.
4. `npm run seed`. Every row is validated first; if anything is wrong you get `file:line field: problem` and **nothing** is written. Fix and re-run, it's idempotent.

**The CSVs are the source of truth.** Each seed makes the database match them: rows you add are inserted, rows you change are updated, and rows you **delete from a CSV are removed** from the registry (scans that referenced them keep their history). A blank `status` means `active`. Lines starting with `#` are comments; a `#` inside a value (`Recall #42`) is kept.

**Never invent NAFDAC numbers.** A made-up "real-looking" number would make demo verdicts and accuracy figures meaningless. Use only the fictional `X9-` demo rows for anything that isn't verified data.

`npm run seed -- --no-demo` loads only the real rows **and removes any demo rows already in the database**, use it for the deployed demo once you have real data. With no real rows it refuses to run rather than empty the registry.

Demo rows are never passed off as real: every API response includes the product's `source`, and a demo match adds a `DEMO_RECORD` signal ("fictional data, not a real NAFDAC registration") and caps confidence at **low**.
