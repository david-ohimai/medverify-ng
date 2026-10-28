# Registry data

The NAFDAC registry MedVerify checks against. Loaded with `npm run seed` (from `server/`).

| File | What | Committed |
|---|---|---|
| `products.demo.csv`, `batches.demo.csv` | **Fictional** rows (`source: demo`, `X9-` numbers, "MedVerify Demo Pharma (fictional)") covering every rule: valid, expired, recalled, cancelled registration. For development, tests and CI. | yes |
| `products.csv`, `batches.csv` | **Real** rows, collected by hand | yes — public registry data |
| `*.template.csv` | Empty files with the right headers and instructions | yes |

## Adding real data

1. `cp products.template.csv products.csv` and `cp batches.template.csv batches.csv`.
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
4. `npm run seed`. Every row is validated first; if anything is wrong you get `file:line field: problem` and **nothing** is written. Fix and re-run — it's idempotent.

**Never invent NAFDAC numbers.** A made-up "real-looking" number would make demo verdicts and accuracy figures meaningless. Use only the fictional `X9-` demo rows for anything that isn't verified data.

`npm run seed -- --no-demo` loads only the real rows (use this for the deployed demo if you have enough real data).
