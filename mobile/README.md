# MedVerify NG, mobile app

The Flutter app for [MedVerify NG](../README.md): verify a medicine before you take it. The full build guide is [docs/mobile-setup.md](../docs/mobile-setup.md).

## What's in it

Splash and onboarding, Home (random safety tips, recent checks), a live camera scanner and gallery upload, live scan progress, the verdict with every reason and your pack beside the genuine one, Listen in English, Pidgin, Hausa, Yoruba or Igbo, a typed-in check, History, nearby Alerts, the Ask MedVerify assistant, and a PIN-protected Regulator mode (dashboard, hotspots, review queue, Ask the data). No sign-up: the phone registers itself.

Built with Flutter 3.47 (via FVM), Riverpod 3, go_router, Dio, camera, flutter_tts and liquid_glass_widgets. Every loading state is a shimmer; the font is Satoshi.

## Run it

The server must be running first ([server guide](../docs/server-setup.md)). With a phone on USB:

```bash
cd mobile
cp env/dev.example.json env/dev.json      # set API_URL: see the table in docs/mobile-setup.md, A3
fvm flutter pub get
adb reverse tcp:3000 tcp:3000
fvm flutter run --dart-define-from-file=env/dev.json
```

The Satoshi font files aren't in the repository (their licence forbids it): [download them first](../docs/mobile-setup.md#a2-get-the-satoshi-font-once-per-clone).

## Check it

```bash
fvm flutter analyze    # No issues found!
fvm flutter test       # 63 tests
```

## Build an APK

The app targets the local server, which only debug builds can reach over `http`:

```bash
fvm flutter build apk --debug --split-per-abi --dart-define-from-file=env/dev.json
adb install -r build/app/outputs/flutter-apk/app-arm64-v8a-debug.apk
```

After installing this way, run `adb reverse tcp:3000 tcp:3000` before opening the app.

## App icon

The launcher PNGs are rendered from one script: `node tool/generate_app_icons.mjs` (uses the server's `sharp`).
