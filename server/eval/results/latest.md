# Eval results, 2026-10-29T08:58:25.898Z (fresh)

| Metric | Value |
|---|---|
| Passed | 8 / 8 |
| Verdict accuracy | 100% |
| Fakes passed as genuine | 0 of 5 |
| False alarms on genuine packs | 0 of 2 |
| Field reading accuracy (NAFDAC no., batch) | 100% |
| Median latency | 18643 ms |

| Case | Result | Verdict | Score | Confidence | Signals | ms |
|---|---|---|---|---|---|---|
| genuine-demoquine | ✓ | likely_genuine | 0 | low | DEMO_RECORD, NAME_MATCHES_REGISTRY, BATCH_KNOWN, VISUAL_MATCH | 85410 |
| recalled-batch | ✓ | high_risk | 50 | low | DEMO_RECORD, NAME_MATCHES_REGISTRY, BATCH_RECALLED | 14427 |
| expired-batch | ✓ | high_risk | 35 | low | DEMO_RECORD, NAME_MATCHES_REGISTRY, EXPIRED | 18643 |
| altered-label | ✓ | suspicious | 33 | low | DEMO_RECORD, NAME_MATCHES_REGISTRY, TEXT_ANOMALIES, VISUAL_MISMATCH | 38854 |
| cloned-number | ✓ | high_risk | 70 | low | DEMO_RECORD, NAME_MISMATCH, BATCH_UNKNOWN, VISUAL_MISMATCH | 239480 |
| unregistered-number | ✓ | unregistered | 45 | high | NOT_IN_REGISTRY | 14999 |
| no-reference | ✓ | likely_genuine | 0 | low | DEMO_RECORD, NAME_MATCHES_REGISTRY, BATCH_KNOWN, PACK_NOT_COMPARED | 11362 |
| not-a-pack | ✓ | NOT_A_MEDICINE_PACK |, |, |  | 11338 |
