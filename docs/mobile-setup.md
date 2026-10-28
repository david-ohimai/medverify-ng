# Mobile build guide — MedVerify NG Flutter app

> Audience: me. Every command, in order, to run the app in `mobile/`, rebuild it from scratch, and explain its architecture.
> Part A runs what's built. Part B rebuilds it step by step. Part C is the architecture and the rules the code follows.

Shell: **Git Bash** unless noted. Working folder: `medverify-ng/mobile/`.

**Stack (latest stable, Oct 2026):** Flutter 3.47.7 / Dart 3.13.5 (pinned with FVM) · Riverpod 3.4 (no code generation) · go_router 18 · Dio 5.11 · flutter_secure_storage 11 · shared_preferences 2.5 (`SharedPreferencesWithCache`) · **liquid_glass_widgets 1.14** · shimmer 4 · iconsax_flutter · Satoshi font · mocktail.

---

## Why FVM, and how the editor finds the right Flutter

Your global Flutter (`C:\Dev\flutter`, 3.38.5) is used by Laba and other projects. The latest packages need Flutter ≥ 3.44, so this project alone is pinned to **3.47.7**:

| File | Effect |
|---|---|
| `mobile/.fvmrc` | `{"flutter": "3.47.7"}` — FVM uses this version inside `mobile/` |
| `.vscode/settings.json` (repo root) | `dart.flutterSdkPath` → `C:\Users\David\fvm\versions\3.47.7`, **this workspace only** |
| `.vscode/launch.json` | Run configs "mobile (dev)" that pass `--dart-define-from-file=env/dev.json` and run the task below first |
| `.vscode/tasks.json` | "adb reverse API port": forwards the phone's port 3000 to the laptop before every F5 launch (see A3) |

So: open the `medverify-ng` folder in VS Code and it uses 3.47.7 automatically; open Laba and it still uses 3.38.5.

In the terminal, call this project's Flutter as **`fvm flutter …`** (PowerShell, where `fvm` is on the PATH) or by full path in Git Bash:

```bash
alias f='/c/Users/David/fvm/versions/3.47.7/bin/flutter'   # Git Bash, per session (or add to ~/.bashrc)
f --version                                               # Flutter 3.47.7 • Dart 3.13.5
```

The rest of this guide writes `fvm flutter`. In Git Bash with the alias, type `f` instead.

---

## Part A — Run it

### A1. One-time machine setup

| # | Command | Why |
|---|---|---|
| 1 | `fvm install 3.47.7` (PowerShell) | Downloads Flutter 3.47.7 (already done on this laptop) |
| 2 | `fvm flutter doctor` | Checks Android SDK, devices |
| 3 | `fvm flutter doctor --android-licenses` | Accept the Android SDK licences (press `y`) so Gradle can download what the build needs |
| 4 | Restart VS Code | Picks up `.vscode/settings.json` |

### A2. Get the Satoshi font (once per clone)

The font's licence (ITF Free Font License) lets the app **embed** it but forbids **redistributing** the files, so they are git-ignored. Download them from Fontshare:

```bash
cd mobile
curl -L -o /tmp/satoshi.zip "https://api.fontshare.com/v2/fonts/download/satoshi"
unzip -o -q /tmp/satoshi.zip -d /tmp/satoshi
for w in Light Regular Medium Bold Black; do cp "/tmp/satoshi/Satoshi_Complete/Fonts/OTF/Satoshi-$w.otf" assets/fonts/; done
ls assets/fonts          # Satoshi-Black/Bold/Light/Medium/Regular.otf
```

PowerShell:

```powershell
cd mobile
Invoke-WebRequest "https://api.fontshare.com/v2/fonts/download/satoshi" -OutFile $env:TEMP\satoshi.zip
Expand-Archive $env:TEMP\satoshi.zip -DestinationPath $env:TEMP\satoshi -Force
"Light","Regular","Medium","Bold","Black" | % { Copy-Item "$env:TEMP\satoshi\Satoshi_Complete\Fonts\OTF\Satoshi-$_.otf" assets\fonts\ }
```

### A3. Point the app at the API

`env/dev.json` is git-ignored; copy it from the example and pick the URL for how you run the app:

```bash
cp env/dev.example.json env/dev.json
```

| Running on | `API_URL` in `env/dev.json` | Extra step |
|---|---|---|
| Android **emulator** | `http://10.0.2.2:3000/api/v1` (the example's default) | — (10.0.2.2 is the emulator's name for your laptop; it does **not** exist on a real phone) |
| Android **phone over USB** (what this laptop uses: Xiaomi 2209116AG) | `http://localhost:3000/api/v1` | `adb reverse tcp:3000 tcp:3000` — forwards the phone's port 3000 to the laptop |
| Phone on the **same Wi-Fi** | `http://<laptop LAN IP>:3000/api/v1` | Find the IP with `ipconfig` (PowerShell); allow Node through Windows Firewall |
| Deployed server | `https://<your-app>.onrender.com/api/v1` | Use `env/prod.json` for release builds |

Not sure whether you're on an emulator or a phone? `adb devices -l` — a real phone shows its model (`model:2209116AG`), an emulator shows `emulator-5554`.

**About `adb reverse`:** the rule lives in adb, not on the phone, and it is **lost whenever adb restarts or the phone is unplugged** — `flutter run` can restart adb. Launching with **F5 → "mobile (dev)"** in VS Code re-adds it automatically (`.vscode/tasks.json`). From a terminal, run it again before `flutter run`:

```bash
adb reverse tcp:3000 tcp:3000
adb reverse --list                                                   # UsbFfs tcp:3000 tcp:3000
adb shell curl -s http://localhost:3000/health/live                  # from the phone: {"status":"ok",...}
```

(`adb` lives in `%LOCALAPPDATA%\Android\Sdk\platform-tools` if it isn't on your PATH.)

`API_URL` is compiled into the app, so after editing `env/dev.json` **stop the app and run it again** — hot reload and hot restart keep the old URL.

Plain `http://` only works in **debug** builds. Release builds refuse it (see Part C, security).

The server must be running: `cd server && npm run db:up && npm run dev` ([server guide](server-setup.md)).

### A4. Install packages and run

```bash
fvm flutter pub get
fvm flutter devices                                           # find your emulator/phone
fvm flutter run --dart-define-from-file=env/dev.json          # or F5 → "mobile (dev)" in VS Code
```

First launch: three onboarding slides → choose a language → Home. In the background the app registers silently. The debug console shows `[api] ← 201 /devices/register`; open Prisma Studio (`cd server && npm run prisma:studio`, http://localhost:5555) and the **devices** table has a row for your phone, plus one in **refresh_tokens** and a `device.registered` row in **audit_logs**.

#### If Home shows an orange banner

The banner means silent registration failed. The debug console tells you why:

| Banner | Console | Cause | Fix |
|---|---|---|---|
| "The server is taking too long" | `✕ connectionTimeout` after ~15 s | The address doesn't exist from where the app runs — usually `10.0.2.2` on a **real phone** | Use the right `API_URL` for your device (A3), then stop and re-run the app |
| "No internet connection" | `✕ connectionError` after ~20 ms | Nothing is listening at that address: the `adb reverse` rule is gone, or the server isn't running | `adb reverse tcp:3000 tcp:3000` (and `npm run dev` in `server/`), then tap **Retry** — no rebuild needed |

Retry works once the network path is fixed; only a changed `API_URL` needs a re-run.

### A5. Check quality

```bash
fvm flutter analyze          # "No issues found!"
fvm flutter test             # 30 tests
```

### A6. Build an APK to install on the demo phone

```bash
cp env/prod.example.json env/prod.json      # set the deployed https:// URL inside
fvm flutter build apk --release --obfuscate --split-debug-info=build/symbols --dart-define-from-file=env/prod.json
# → build/app/outputs/flutter-apk/app-release.apk
adb install -r build/app/outputs/flutter-apk/app-release.apk
```

`--obfuscate` renames classes and functions in the release binary; `build/symbols` keeps what's needed to read crash stack traces (git-ignored, keep it locally). A debug APK for quick testing: `fvm flutter build apk --debug --dart-define-from-file=env/dev.json`.

---

## Part B — Build it from scratch, step by step

### B1. Project and SDK pin

```bash
fvm install 3.47.7
cd medverify-ng
/c/Users/David/fvm/versions/3.47.7/bin/flutter create --org ng.medverify --project-name medverify \
  --platforms android,ios --description "MedVerify NG - verify a medicine before you take it." mobile
cd mobile
echo '{ "flutter": "3.47.7" }' > .fvmrc
```

Then create `../.vscode/settings.json` with `"dart.flutterSdkPath": "C:\\Users\\David\\fvm\\versions\\3.47.7"`.

> `fvm use 3.47.7` is the usual way, but on this laptop FVM's own Dart snapshot is out of date ("Invalid kernel binary format version"), so the two files are written by hand. Same result, and no Windows symlinks needed.

### B2. Packages (all latest)

```bash
fvm flutter pub add flutter_riverpod go_router dio equatable flutter_secure_storage shared_preferences \
  shimmer liquid_glass_widgets iconsax_flutter uuid package_info_plus
fvm flutter pub add dev:mocktail
```

| Package | Used for |
|---|---|
| `flutter_riverpod` 3 | State and dependency injection — every controller and service is a provider |
| `go_router` 18 | Routing, the onboarding redirect, `StatefulShellRoute` for the five tabs |
| `dio` | HTTP, interceptors (auth, safe logging) |
| `equatable` | Value equality for states, entities and failures (fewer rebuilds) |
| `flutter_secure_storage` 11 | Install id + tokens in Keystore / Keychain |
| `shared_preferences` | Theme, language, onboarding flag (`SharedPreferencesWithCache` → synchronous reads) |
| `liquid_glass_widgets` | Floating glass tab bar, glass cards and containers |
| `shimmer` | Every loading state |
| `iconsax_flutter` | Icons matching the reference design |
| `uuid` | The random install id (v4) |
| `package_info_plus` | App version for registration and Settings → About |
| `mocktail` | Mocks in tests |

### B3. Folder structure (Laba's clean architecture, per feature)

```bash
mkdir -p lib/core/{config,constants,errors,extensions,locale,network/interceptors,result,router,storage,theme}
mkdir -p lib/shared/widgets/shimmer
for f in session onboarding home history scan alerts settings shell; do mkdir -p lib/features/$f/{data,domain,presentation/{providers,screens,widgets}}; done
mkdir -p assets/fonts env test/{core,features,widgets}
```

```
lib/
├── main.dart              # void main() => bootstrap();
├── bootstrap.dart         # composition root: prefs, glass shaders, ProviderScope + overrides
├── app.dart               # MaterialApp.router, theme mode, silent registration kick-off
├── core/                  # no feature imports — everything here is reusable
│   ├── config/env.dart                 # API_URL from --dart-define, validated at startup
│   ├── constants/                      # endpoints, storage keys, app constants, AppLanguage
│   ├── errors/failure.dart             # sealed Failure hierarchy (safe messages)
│   ├── errors/failure_mapper.dart      # DioException / status → Failure
│   ├── result/result.dart              # sealed Result<T> = Success | Err
│   ├── network/                        # ApiClient, envelope, AuthTokenSource, interceptors, providers
│   ├── storage/                        # SecureStore, PreferencesStore, providers
│   ├── theme/                          # AppPalette (ThemeExtension), typography, dimens, AppTheme, theme mode
│   ├── locale/language_controller.dart
│   ├── router/                         # routes + GoRouter provider
│   └── extensions/context_x.dart       # context.palette, context.text, context.isTablet …
├── shared/widgets/        # design system: backdrop, page layout, AI insight card, pills, tiles, empty/error, shimmer
└── features/<feature>/
    ├── data/              # datasources (remote/local), models (JSON ↔ entity), repository implementations
    ├── domain/            # entities, repository interfaces — pure Dart
    └── presentation/      # providers (controllers), screens, widgets
```

### B4. Core, in this order

1. `core/config/env.dart` — `String.fromEnvironment('API_URL')`; `Env.validate()` throws on startup if it's missing, malformed, or `http://` in a release build.
2. `core/result/result.dart` and `core/errors/failure.dart` — sealed types, so `switch` must handle every case.
3. `core/network/api_envelope.dart` — parses the server's `{ success, message, statusCode, code, data, errors, meta }`.
4. `core/errors/failure_mapper.dart` — timeouts → `TimeoutFailure`, no connection → `NetworkFailure`, every Dio error type (incl. `transformTimeout`) maps to a failure, 401 keeps the server `code` (`TOKEN_EXPIRED`, `TOKEN_REVOKED`…), 422 keeps field errors, 429 reads `Retry-After`, 5xx never shows server text.
5. `core/network/api_client.dart` — `get/post/patch/delete<T>(path, parse:)` → `Result<T>`. Nothing above it sees Dio or JSON.
6. `core/network/auth_token_source.dart` + `interceptors/auth_interceptor.dart` — adds the token; on a 401 with a token code, asks the session to recover once and replays the request with a Dio that has no auth interceptor (no loops).
7. `core/network/interceptors/safe_log_interceptor.dart` — debug-only, masks tokens/PIN/install id.
8. `core/storage/*` — `SecureStore` (Keychain item `first_unlock_this_device`: not synced to iCloud), `PreferencesStore` (synchronous after startup).
9. `core/theme/*` — `AppPalette` holds what `ColorScheme` can't (action orange, verdict colours, AI gradient, shimmer, backdrop tints); `AppTheme.light()/dark()` from one recipe; `ThemeModeController` persists the choice.
10. `core/router/app_router.dart` — created once; redirects to onboarding until it's done; `refreshListenable` bumps when the flag changes.

### B5. Features

| Feature | What's in it |
|---|---|
| `session` | Silent registration and tokens. `SessionRepositoryImpl` registers on first launch (install id + platform + version + language), stores tokens, and implements `AuthTokenSource`. Every session operation (launch registration, recovery after a 401) runs **one at a time** through a small queue, so a 401 during first-launch registration waits for it instead of registering a second device; **one refresh in flight** is shared by every request that got a 401, and a late 401 for an already-replaced token just reuses the new one; a rejected refresh token clears the session and re-registers; offline keeps tokens. The install id is created once and shared by concurrent callers. `SessionController` (AsyncNotifier) runs it at launch without blocking the UI. |
| `onboarding` | 3 slides, language picker, "never 100% safe" promise. `OnboardingController` owns page + language; the screen only owns its `PageController`. |
| `shell` | `AppShell` = `GlassScaffold` + `AppBackdrop` + `AppTabBar` (`GlassTabBar.bottom` with a sliding glass pill and a `GlassBadge` for alerts). |
| `home` | Greeting (from `greetingProvider` + injectable clock), AI Insight glass card, quick actions, recent scans, offline banner with retry. |
| `settings` | Theme (System/Light/Dark), language, About (version loads with a shimmer). |
| `history`, `scan`, `alerts` | Placeholders with empty states until those features land. |

### B6. Wiring (bootstrap.dart)

```dart
final (prefs, _) = await (SharedPreferencesWithCache.create(...), LiquidGlassWidgets.initialize()).wait;
runApp(LiquidGlassWidgets.wrap(
  brightnessResolver: Theme.maybeBrightnessOf,          // glass follows the app's theme toggle
  child: ProviderScope(
    retry: (_, _) => null,                              // Riverpod 3 auto-retry off: we retry explicitly
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      authTokenSourceProvider.overrideWith((ref) => ref.watch(sessionRepositoryProvider)),
    ],
    child: const MedVerifyApp(),
  ),
));
```

`core` declares `authTokenSourceProvider` but never imports the session feature; bootstrap connects them. That keeps the dependency direction one-way: features → core.

### B7. Platform configuration

| Where | Change | Why |
|---|---|---|
| `android/app/build.gradle.kts` | `applicationId`/`namespace` `ng.medverify.app`; `minSdk ≥ 24` (compileSdk stays Flutter's default) | flutter_secure_storage 11 needs Android 7.0+ |
| `android/app/src/main/AndroidManifest.xml` | `INTERNET`; `allowBackup=false`, `dataExtractionRules`; `networkSecurityConfig` | Tokens never leave the phone in backups; HTTPS only |
| `android/app/src/main/res/xml/network_security_config.xml` | No cleartext, system CAs only | Blocks plain HTTP and user-installed CAs (harder to intercept) |
| `android/app/src/debug/res/xml/network_security_config.xml` | Cleartext allowed | Debug builds can reach `http://10.0.2.2:3000` |
| `ios/Runner/Info.plist` | `NSAllowsLocalNetworking`; display name MedVerify | Local dev over http only; everything else HTTPS |
| `ios/Runner.xcodeproj` | Bundle id `ng.medverify.app` | |
| `pubspec.yaml` | Satoshi family (300/400/500/700/900) | |
| `.gitignore` | `/assets/fonts/*.otf`, `/env/*.json` (examples kept), `.fvm/` | Licence; local URLs |

### B8. Tests

| File | Covers |
|---|---|
| `test/core/failure_mapper_test.dart` | Envelope parsing; 401 keeps codes, 403/422/429/5xx mapping, 5xx hides server text |
| `test/core/api_client_test.dart` | Success parse, typed 4xx failure, offline, wrong-shaped body → failure not crash (fake Dio adapter) |
| `test/features/session/session_repository_test.dart` | First-launch registration payload; no network on later launches; refresh; **3 concurrent 401s → 1 refresh**; reused token → clear + re-register; offline keeps tokens; **401 during first-launch registration → no second registration**; late 401 reuses the new token |
| `test/features/session/session_local_data_source_test.dart` | Concurrent first calls → one install id; a failed read isn't cached |
| `test/core/auth_interceptor_test.dart` | `TOKEN_REVOKED` → recover with the failed token → replay; secure storage failing → `StorageFailure`, never a hung request |
| `test/features/onboarding/onboarding_controller_test.dart` | Page bounds; finish saves language + flag |
| `test/features/home/greeting_test.dart` | Greeting by hour with an injected clock |
| `test/widgets/onboarding_screen_test.dart` | Full onboarding flow on a phone-sized screen |

```bash
fvm flutter analyze
fvm flutter test
```

---

## Part C — Architecture and the rules the code follows

### Data flow

```
Widget ──watch──► Controller (Notifier / AsyncNotifier) ──► Repository (interface in domain/)
                                                              └─► impl in data/ ──► DataSource ──► ApiClient / SecureStore / Prefs
                                                                                          └─ returns Result<T> (never throws)
```

### Rule 1 — No logic in the UI

Widgets render state and forward taps; they decide nothing.
- Greeting by time of day → `greetingProvider` (with an injectable `clockProvider`, so it's testable).
- Onboarding paging, language choice, finishing → `OnboardingController`.
- Theme and language persistence → `ThemeModeController`, `LanguageController`.
- Registration, refresh, retry → `SessionRepositoryImpl` / `SessionController`.
- Error text → `Failure.message`, chosen in `failure_mapper.dart`, not in widgets.

### Rule 2 — No `setState`

There is **no `setState` anywhere** (`grep -r setState lib` returns nothing). State lives in Riverpod controllers. The only `StatefulWidget` is `OnboardingScreen`, and only to create and dispose its `PageController`. The page index itself is in the controller, and the `PageView` follows it through `ref.listen`.

### Rule 3 — No unnecessary rebuilds

| Technique | Where |
|---|---|
| `ref.watch(provider.select(...))` — rebuild only when that field changes | Onboarding footer (page only), language picker (language only), connection banner (error only) |
| Small `ConsumerWidget`s at the leaves; parent screens stay `StatelessWidget` | `HomeScreen` sections, `AppTabBar` (only it watches the alert count), settings sections |
| `ref.listen` instead of `watch` for side effects | `MedVerifyApp` starts registration without rebuilding the app; onboarding animates the `PageView` |
| Router created once; redirect uses `ref.read` + `refreshListenable` | `app_router.dart` |
| Themes built once (`static final`) | `app.dart` |
| `const` constructors everywhere they're possible | all widgets |
| `RepaintBoundary` around constantly animating/painted layers | shimmer sweep, mesh backdrop |
| `MediaQuery.sizeOf` instead of `MediaQuery.of` | `context_x.dart` — keyboard opening doesn't rebuild width-based layouts |
| `Equatable` states | Riverpod 3 compares with `==`; equal states don't notify |
| `StatefulShellRoute.indexedStack` | Tabs keep their state; switching tabs doesn't rebuild them |

### Rule 4 — Loading is always a shimmer

`AsyncValueView` maps loading → a skeleton shaped like the content (`AppShimmer` + `ShimmerBox/Line/Circle`, colours from the theme so dark mode works), error → `ErrorView` with retry, data → content. No bare spinners.

### Rule 5 — Liquid glass on floating chrome only

Glass: tab bar, AI Insight card, onboarding icon tiles (later: app bar, sheets, verdict overlay). Solid: list cards. Every screen sits on `AppBackdrop` so the glass has colour to refract. Glass follows the app's theme through `brightnessResolver: Theme.maybeBrightnessOf`.

### Rule 6 — Security

| Threat | Defence | Where |
|---|---|---|
| Token theft from storage | Keystore / Keychain (`first_unlock_this_device`, never synced) | `core/storage/secure_store.dart` |
| Tokens copied via backups / device transfer | `allowBackup=false`, data extraction rules exclude everything | Android manifest + `data_extraction_rules.xml` |
| Traffic interception | HTTPS-only release builds (Android network config, iOS ATS), system CAs only, `Env.validate()` refuses `http://` in release | platform configs, `env.dart` |
| Secrets in logs | Logging only in debug; tokens/PIN/install id masked | `safe_log_interceptor.dart` |
| Secrets in the app binary | None exist — no API keys ship in the app; LLM keys stay on the server | — |
| Stolen refresh token | Server rotates refresh tokens and revokes the chain on reuse; app shares one refresh in flight so it never trips that itself | `session_repository_impl.dart` |
| Reverse engineering | `--obfuscate --split-debug-info` on release builds | A6 |
| Text that breaks layouts | Text scaling clamped at 1.3× (still accessible) | `app.dart` |
