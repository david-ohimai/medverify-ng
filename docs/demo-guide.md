# MedVerify NG, demo guide

For David, on the day. Three parts: **prepare**, **run the demo**, **if something breaks**. The talk is about 5 minutes of demo inside the slide deck ("Live demo" slide). A longer slot adds the optional steps.

> **The story in one line:** a fake pack gets past a register check, the photo exposes it, the buyer hears the warning in Pidgin, and a regulator acts on it.

---

## 1. The day before

Do all of this once, then do a full rehearsal with a timer.

| ✓ | Task | How |
|---|---|---|
| ☐ | Build the app from the latest `main` | `cd mobile`, then `fvm flutter build apk --debug --split-per-abi --dart-define-from-file=env/dev.json` |
| ☐ | Install it | `adb install -r build\app\outputs\flutter-apk\app-arm64-v8a-debug.apk` |
| ☐ | Put the demo packs on the phone (commands below) | They appear in the gallery, in the `MedVerifyDemo` album |
| ☐ | Install voices | Phone: Settings → Additional settings → Languages & input → Text-to-speech output → gear → Install voice data → **English (Nigeria)**, and Hausa if listed |
| ☐ | **Rehearse every scan in part 3** | The AI's answer for each photo is cached for 7 days, so the same photo comes back much faster on the day. Rehearse within 7 days of the demo |
| ☐ | Tap Listen → Naija Pidgin on the altered pack | Translations are cached as well, so it plays quickly on the day |
| ☐ | Load the real register | In `server/`: `npm run seed`. It holds 8,679 products from the NAFDAC Greenbook |
| ☐ | **Scan 5 real packs with the live camera** | See how real packs behave before the audience does (part 3, "Scan a real pack live") |
| ☐ | **Record a backup video** of the whole flow | Phone screen recorder. Copy it to the laptop |
| ☐ | Export the deck to PDF | Keep it on the laptop and on a USB stick, in case the venue has no internet |
| ☐ | Charge the phone and the laptop; pack the USB cable | |

Put the packs on the phone, from the repository root:

```powershell
adb shell mkdir -p /sdcard/Pictures/MedVerifyDemo
adb push server\eval\fixtures\demoquine-altered.jpg /sdcard/Pictures/MedVerifyDemo/
adb push server\eval\fixtures\demoquine-recalled.jpg /sdcard/Pictures/MedVerifyDemo/
adb push server\eval\fixtures\demoquine-genuine.jpg /sdcard/Pictures/MedVerifyDemo/
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/MedVerifyDemo/demoquine-altered.jpg
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/MedVerifyDemo/demoquine-recalled.jpg
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/MedVerifyDemo/demoquine-genuine.jpg
```

If the album doesn't appear, restart the phone's gallery app, or send the three files to the phone any other way.

**Don't, in the 24 hours before the demo:**

- Run `npm run eval -- --fresh`, `eval:agent` or `kb:ingest`. They use up free AI quota.
- Merge anything new, or change a prompt. A new prompt version means the cached answers no longer apply.
- Scan many real medicines right before going on. The free tier allows only a few AI calls a minute.

---

## 2. 30 minutes before

Terminal 1, in `server/`:

```powershell
# 1. Start Docker Desktop first and wait until it says "running".
npm run db:up

# 2. Nothing else may be holding port 3000. This should print nothing:
netstat -ano | findstr ":3000 "
# If it prints a LISTENING line, stop that process: Stop-Process -Id <the last number>

# 3. Refresh the pilot data. Hotspots only count the last 7 days, so old data shows nothing.
npm run simulate

# 4. Start the server, and leave this terminal open.
npm run dev
```

The server log should end with `Server listening on http://localhost:3000`, and show the scan, hotspot and review workers started.

Terminal 2, with the phone on USB:

```powershell
adb reverse tcp:3000 tcp:3000
adb shell curl -s http://localhost:3000/health/live
```

The second command must print `{"status":"ok",...}`. This is the check that the phone can reach the server. **Run `adb reverse` again every time the phone is unplugged.**

Then set up what the audience will see:

| ✓ | Where | What |
|---|---|---|
| ☐ | Phone | Do Not Disturb on, brightness up, screen timeout long, media volume up, Wi-Fi notifications off |
| ☐ | App | Open it. No orange banner on Home. Settings → Preferences → Language: English. **Settings → Regulator: leave regulator mode** if it's on, so the demo starts as a public user |
| ☐ | Laptop tab 1 | The deck, on the first slide |
| ☐ | Laptop tab 2 | Swagger: http://localhost:3000/api-docs |
| ☐ | Laptop tab 3 (optional) | Prisma Studio, `npm run prisma:studio`, http://localhost:5555, table `ai_audit_logs` |
| ☐ | Screen sharing | Test showing the phone on the projector now: a phone mirroring app, or a camera over the phone. If neither works, hold the phone up and describe each step |
| ☐ | Quick test | Tap the Alerts tab, choose Lagos: the Idumota alert should be listed |

---

## 3. The demo (about 5 minutes)

Times are a guide. **What to say** is in quotes: use your own words.

### Step 1. Scan a fake pack (90 s)

| Do | See |
|---|---|
| Scan tab → close the camera → **Choose from gallery** → `demoquine-altered` | Steps tick one by one: reading the label, the register, the batch, comparing the pack, scoring |
| Wait for the result | **Suspicious**, about 33 / 100, low confidence |
| Scroll through "Why we think so" | Printing or spelling problems; differs from the genuine pack |
| Show your pack beside the genuine one | The two photos side by side |

> "This pack has a real registered number and a real batch. A database check would pass it. The AI read the label and caught the misspellings, and compared it with a photo of the genuine pack. Two AI steps give the evidence; plain rules decide the verdict. Every reason is on screen, and it never says 'safe'."
>
> "These are drawn demo packs, clearly marked. I'm using the gallery so the timing is predictable; the live camera does the same thing."

### Step 2. Hear it in Pidgin (30 s)

| Do | See |
|---|---|
| On the Listen card tap **Naija Pidgin**, then play | The warning spoken, and the text on screen |

> "Many buyers can't read small print or English labels. The AI translates the verdict, but it's told never to soften a warning. The phone's own voice reads it, and the translation is cached, so it costs nothing the second time."

If you have a moment, tap **Hausa**. If the phone has no such voice, the card shows the text and says so. That is the designed behaviour.

### Step 3. The regulator's view (90 s)

| Do | See |
|---|---|
| Settings → **Regulator** → PIN `246810` (the `REGULATOR_DEMO_PIN` in `server/.env`) → Unlock | Regulator mode on |
| Home → **Regulator** tile | Dashboard: stat cards, review queue, active hotspots marked as including simulated pilot data |
| Point at the hotspots | Idumota (recalled batch DQ2310), Onitsha (unregistered number), Kano (number on the wrong product) |
| **Review queue** → open the scan you just made → **Claim this review** → **Agree** → **Save decision** | Decision saved |

> "Scans cluster by place using PostGIS. A background job finds the clusters every 15 minutes and AI writes the alert from the facts only: it must say 'suspected', never 'confirmed'. These hotspots come from about 1,400 simulated pilot scans, and the app labels them as simulated. Risky scans come here for a human, with deadlines, and the reviewer's decision goes back to the person who scanned."

### Step 4. Ask the data (45 s)

| Do | See |
|---|---|
| On the dashboard tap **Ask the data** | Tool chips run live, then an answer ranking the hotspots |

> "This is an agent with eight read-only tools. It can't change anything, and it can only state facts a tool returned."

### Step 5. Under the hood (45 s)

Laptop, Swagger:

| Do | See |
|---|---|
| Show the endpoint list, then `GET /health/ready` → Try it out → Execute | `ready`: Postgres and Redis both answer |
| (Optional) Prisma Studio → `ai_audit_logs` | A row for each AI call: provider, model, prompt version, tokens, latency |

> "The brief is the backend. The app is one client: everything you saw is this documented API. Layered routes, services and repositories, BullMQ workers for slow jobs, and every AI call logged."

Back to the deck: **Evaluation** slide.

### Scan a real pack live (60 s)

Do this straight after step 1. Scan tab → point the camera at the side with the NAFDAC number → capture. Any medicine pack can be used, including one from the audience.

> "That was a drawn pack. This one is real, live, with the camera. The register behind it is the public NAFDAC Greenbook: 8,679 products."

**What a real pack gets:**

| Check | Real pack today |
|---|---|
| AI reads the number, name, batch, dates and spelling | Yes |
| Number and name against the Greenbook | Yes |
| Expiry | Yes, from the date printed on the pack |
| Batch recalls | Only for batches in our records; the Greenbook doesn't list batches |
| Comparison with a genuine photo | **No**, until a reference photo exists for that product. The verdict says the pack wasn't compared |

**What to expect:**

- A live photo is new every time, so it isn't cached. Allow 10 to 40 seconds, and talk through the steps on screen.
- **Likely genuine with low confidence** is the usual clean result: the batch is unknown and the pack wasn't compared. Read the reasons out.
- **Likely genuine, "Ask a pharmacist"** appears when the Greenbook doesn't list the registration as active. That's about a third of entries, including common medicines, and it may just mean a renewal isn't listed, so it's a caution rather than a warning.
- **Not found** means the number isn't in the Greenbook copy, or the AI misread it. Check the number shown under "What we read"; if it's wrong, retake the photo.
- Hold the pack steady, avoid glare, and keep the number sharp.

### Optional, if you have time

| Moment | Do | Why |
|---|---|---|
| A clear high risk (30 s) | Regulator or public: gallery → `demoquine-recalled` → **High risk**, batch recalled. Same batch as the Idumota hotspot | The strongest red verdict |
| Likely genuine (30 s) | Gallery → `demoquine-genuine` → **Likely genuine** | Shows it doesn't cry wolf |
| No AI needed (30 s) | Home → type a number: `X9-0001`, batch `DQ2310` → instant high risk | The register check works without AI |
| Official answers (45 s) | Ask MedVerify → "How do I report a fake drug in Nigeria?" | Answers from WHO and NAFDAC, with sources |
| Off-topic (20 s) | Ask MedVerify → "Best jollof rice recipe?" | It politely declines |

### Before leaving the stage

Settings → Regulator → leave regulator mode.

---

## 4. If something breaks

**Stay calm and name it.** "This is running on free AI tiers on my laptop" is a fair, honest sentence. Then use the row below.

| What you see | Likely cause | Do this |
|---|---|---|
| Orange "No internet connection" banner | `adb reverse` is gone, or the server stopped | `adb reverse tcp:3000 tcp:3000`, check terminal 1, tap **Retry** |
| "The server is taking too long" | Wrong address in the app, or the server is frozen | Check `adb shell curl -s http://localhost:3000/health/live`; restart `npm run dev` |
| Listen says "Route not found", or something old | An old server still holds port 3000 | Stop terminal 1, run the `netstat` check in part 2, stop the old process, `npm run dev` again |
| A scan sits on one step | Gemini's per-minute limit, so it's waiting or falling back to OpenRouter | Keep talking about the control plane: this **is** the fallback working. Each attempt stops at 30 s |
| "AI unavailable" or "Photo checks are paused" | Daily free quota used up | Typed-in check: `X9-0001`, batch `DQ2310`. It needs no AI. Then play the backup video for the rest |
| A voice doesn't play | No voice for that language on the phone | The text is on the card. Say so, and move on |
| Alerts or the dashboard show no hotspots | Simulated data is older than 7 days | Terminal: `npm run simulate`, then come back to the screen |
| Docker won't start | Docker Desktop isn't running | Start it and wait a minute. If it stays down, go to the backup video |
| The phone won't connect at all | Cable or USB debugging | Switch the USB mode to file transfer; accept "Allow USB debugging?"; `adb devices` must say `device` |
| Everything fails | | Play the backup video and narrate it. Show Swagger only if the server is up. Carry on with the Evaluation slide |

No cable in the room? See "Wireless debugging" in [mobile-setup.md, A3](mobile-setup.md#a3-point-the-app-at-the-api). Test it during the rehearsal, not on the day.

---

## 5. Say it straight

Being upfront here earns more trust than a polished claim.

**True, and worth saying:**

- 0 of 5 fake packs passed as genuine; 8 of 8 photo cases correct. On **drawn, fictional packs**.
- Retrieval: right document first 15 of 16; off-topic questions return nothing.
- Assistant 10 of 10 on its eval. 283 server tests and 63 app tests pass.
- Median scan on the free tier: about 19 s. It includes rate-limit waits.

**Don't claim, or scan:**

| Don't | Because |
|---|---|
| Don't call one real scan proof of accuracy | One scan isn't an evaluation, and pack comparison isn't running on real products yet |
| Don't say a "Not found" pack is fake | It means the number isn't in our copy of the Greenbook, or was misread. The app says to ask a pharmacist |
| Don't say "it detects fakes with X% accuracy" | The eval proves the pipeline on drawn packs, not real-world accuracy |
| Don't say "safe" or "confirmed" | The product never does, on purpose |
| Don't say "deployed" or "live map" | It runs on your laptop, and hotspots are a list, not a map. The map is future work |
| Don't call the hotspots real | They're simulated pilot data, and labelled so in the app |
| Don't promise a Yoruba or Igbo voice | It depends on the voices the phone has; the text always shows |

---

## 6. Questions you may get

| Question | Short answer |
|---|---|
| Why not let AI decide the verdict? | No labelled field data yet, so a trained model would be a black box. A weighted score can be explained and tested. AI supplies the evidence |
| Why a queue and a 202? | AI calls take seconds and can fail. The job retries with backoff, failed jobs land in a dead-letter queue, and the app gets live progress over SSE |
| Why SSE, not WebSockets? | Updates only go one way, over plain HTTP. Auth headers and reconnecting just work |
| What if Gemini goes down? | OpenRouter takes over automatically: retries, a circuit breaker per provider, a 30 s deadline, a daily quota guard |
| How do you stop the AI making things up? | Output is checked against a Zod schema. The label prompt says return null, never guess. The assistant states facts only from its tools, and answers guidance only from official documents |
| What about prompt injection? | Tools are read-only and validated. Text in photos and documents is treated as data, and suspected attempts are logged |
| Could a counterfeiter probe it? | Per-device and per-network rate limits, and every call is audited. It's a real risk, and reviewed in future work |
| Why no sign-up? | Adoption is the biggest risk. A hashed install id still gives limits, history and an audit trail |
| What about a shared regulator PIN? | Demo only, and guesses are limited. Real use needs personal, expiring, revocable codes |
| Privacy? | Photos aren't kept, unless a human must review them, at most 7 days. EXIF is stripped. Location is optional and rounded to about 1 km |
| What would you do next? | Genuine reference photos and batch records for real products, so comparison and recall checks reach every pack. Then an eval on real photos |
| What was hardest? | Free-tier limits: one fallback call hung for almost 4 minutes, which led to the hard 30 s deadline |

More defence questions: [server-setup.md, Part C](server-setup.md).
