# MedVerify NG

**Verify a medicine before you take it.** MedVerify NG is a proposed AI-powered tool for spotting counterfeit and substandard drugs in Nigeria at the point of purchase.

> This is a **solution proposal**, submitted for the Week 3 Group Assignment (AI Solution Challenge) of the Mastering Backend AI Engineering Bootcamp. It is a concept and design document, not a working application.

**My role:** problem research and solution design (David Ohimai).

---

## A. Problem statement

Counterfeit and substandard medicines are widespread in Nigeria's markets, patent medicine stores and some pharmacies, and buyers have no easy way to spot them at the point of purchase. Fake drugs cause treatment failure, drug resistance, deaths and financial loss. Current checks like NAFDAC's scratch codes have limited coverage and can be copied. People need a quick phone-based way to verify a drug and stop harm before it is taken.

## B. Target users

| User | Current challenge | How the problem affects them |
|---|---|---|
| Patients and caregivers | Can't spot fakes by eye; many can't read small print or English labels | Wasted money, failed treatment, health risk |
| Pharmacists and patent medicine vendors | Buy from wholesalers without a quick way to verify stock | Lost reputation, sanctions, harm to customers |
| Community health workers | Dispense drugs in rural areas far from regulators | Patients lose trust in the clinic |
| NAFDAC and state regulators | Rely on slow, manual market raids and tip-offs | Can't see in time where fakes are spreading |
| Genuine manufacturers | Brands and packaging get copied | Lost sales and damaged brand trust |

## C. Proposed AI solution

MedVerify NG is a mobile app (with a WhatsApp option) that tells a user within seconds whether a drug pack is **likely genuine, suspicious or unregistered**. The user photographs the pack. The app compares its packaging, label text, NAFDAC number and batch details with registered product records (such as NAFDAC's Greenbook) and with images of verified genuine packs.

- Verification happens **at the point of purchase**, before the drug is taken.
- No scratch code is needed, so it works on any packed product.
- Results come in English, Pidgin, Hausa, Yoruba and Igbo, including voice.
- Every scan feeds a **location-based hotspot map** sent to NAFDAC as an early warning.

## D. How it works

```mermaid
flowchart LR
    A[User photographs<br/>the drug pack] --> B[AI reads label,<br/>logo and codes]
    B --> C[Match with<br/>NAFDAC records]
    C --> D[AI risk score]
    D -->|low risk| E["Likely genuine"<br/>+ confidence level]
    D -->|high risk| F[Warn user,<br/>log report]
    F --> G[Hotspot map +<br/>NAFDAC alert]
```

The user scans the pack. AI reads and checks it, matches it against registered records, and produces a risk score. A high score warns the user and logs the scan location, which feeds the hotspot map and alerts NAFDAC.

## E. Where AI is needed

AI is used only where fixed rules can't cope with messy real-world images and patterns. **The record lookup itself is an ordinary database search and does not need AI.**

| AI component | What it does | Why AI is necessary |
|---|---|---|
| Text recognition (OCR) | Reads the NAFDAC number, batch, expiry and names from blurry, curved or poorly lit photos | Pack photos vary too much for simple rules to read reliably |
| Image recognition | Compares logo, colours, fonts and layout with verified genuine packs | Good fakes differ in subtle visual details humans miss |
| Risk scoring | Weighs all the signals (visual match, record match, expired or duplicated batch) into one score | The signals conflict, and a trained model balances them better than yes/no rules |
| Hotspot detection | Finds clusters of suspicious scans by location and time | Spotting new patterns across thousands of scans needs pattern analysis |

## F. Expected outcome

- **Better access to information:** anyone with a phone can verify a drug in seconds, in their own language.
- **Better decisions:** patients and pharmacists reject suspicious stock before using or reselling it.
- **Faster enforcement at lower cost:** NAFDAC targets raids using live hotspot maps instead of blind inspections.
- **Better health outcomes:** fewer treatment failures, less drug resistance, and more trust in genuine brands.

## G. Risks and limitations

| Risk | Impact | Mitigation |
|---|---|---|
| Incorrect AI outputs | A fake marked "genuine" causes harm; a genuine drug marked "fake" hurts sellers | Show confidence levels, never claim "100% safe", route high-risk cases to a pharmacist or NAFDAC for review |
| Availability of data | Incomplete records and few reference images weaken accuracy | Partner with NAFDAC and manufacturers for pack images and batch data |
| User adoption and access | Low smartphone use, poor internet and low literacy in rural areas | WhatsApp and USSD options, voice results, pharmacist-assisted scanning |
| Data privacy and security | Location data could be misused; counterfeiters could probe the system | Comply with the Nigeria Data Protection Act 2023, anonymise locations, rate-limit scans |

## H. Measuring success

Success would be judged over a 12-month pilot in Lagos, Kano and Onitsha. These are **proposed targets**, to be agreed with NAFDAC.

| Indicator | How it is measured | Proposed target |
|---|---|---|
| Detection accuracy | Share of results confirmed correct by NAFDAC lab tests on sampled packs | 90% or higher |
| Response time | Time from photo upload to result shown | Under 10 seconds |
| Active users | Monthly users completing at least one scan | 100,000 by month 12 |
| Enforcement impact | Verified hotspots acted on by NAFDAC within 30 days | 50% or more |
| User satisfaction | In-app rating and short surveys | 4 out of 5 or higher |

---

## Appendix: a possible technical design

_My own sketch of how this could be built, using the patterns from the bootcamp. Not part of the original group submission._

```mermaid
flowchart LR
    App[App / WhatsApp bot] -->|photo| API[API<br/>auth · rate limit per device]
    API -->|scan id, status=pending| App
    API --> Q[(Job queue)]
    Q --> W[Scan worker]
    W --> OCR[OCR service]
    W --> REG[(Registry DB<br/>NAFDAC records)]
    W --> VEC[(pgvector<br/>genuine-pack image embeddings)]
    W --> RS[Risk scorer]
    RS --> DB[(Scans + audit log)]
    DB --> HS[Hotspot clustering<br/>batch job]
    HS --> NAFDAC[Regulator dashboard / alerts]
```

1. **Async pipeline.** The upload returns a scan ID straight away. A queue worker runs OCR and image matching, with retries and a dead-letter queue.
2. **Exact match first.** The registration number goes through a plain indexed SQL lookup. Models are only called when that check is inconclusive.
3. **Pack similarity.** Image embeddings of verified genuine packs are stored in pgvector and compared by nearest neighbour.
4. **Explainable verdicts.** The risk score returns its contributing signals and a confidence band, never a bare yes/no.
5. **Abuse controls.** Per-device rate limits stop counterfeiters from probing the model, and every verdict is written to an audit log.

## Original submission

The original group document is in [`docs/AI_Solution_Proposal.docx`](docs/AI_Solution_Proposal.docx).
