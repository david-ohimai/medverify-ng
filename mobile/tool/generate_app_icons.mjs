// Renders the MedVerify launcher icon to every PNG size Android and iOS need.
// Same shapes as the splash logo (android/app/src/main/res/drawable/splash_logo.xml
// and SplashLogo in splash_screen.dart): a white shield with a tick on the
// violet-to-blue brand gradient. Android 8+ uses the vector adaptive icon in
// res/mipmap-anydpi-v26; these PNGs are for Android 7 and for iOS.
//
// Run from mobile/ (uses the server's sharp, so `npm install` in server/ first):
//   node tool/generate_app_icons.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("../../server/node_modules/sharp");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const gradient = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#8B82FF"/><stop offset="1" stop-color="#5CC4FF"/></linearGradient>`;

/** The shield and tick, scaled about the logo's centre (48, 48.5) on a 96 grid. */
const mark = (scale) => `<g transform="translate(48 48.5) scale(${scale}) translate(-48 -48.5)"
  fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
  <path d="M48,25L67,32L67,47C67,59 59,68 48,72C37,68 29,59 29,47L29,32Z"/>
  <path d="M39.5,48.5L45.5,54.5L57,43"/></g>`;

/** iOS and the store master: a full square (iOS rounds the corners itself, and needs no transparency). */
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs>${gradient}</defs>
  <rect width="96" height="96" fill="url(#g)"/>${mark(1.25)}</svg>`;

/** Android 7 launchers show the PNG as it is: a round icon. */
const round = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs>${gradient}</defs>
  <circle cx="48" cy="48" r="48" fill="url(#g)"/>${mark(1.15)}</svg>`;

async function render(svg, size, file) {
  const out = join(root, file);
  mkdirSync(dirname(out), { recursive: true });
  let image = sharp(Buffer.from(svg), { density: 72 * Math.ceil(size / 96) * 4 }).resize(size, size);
  // The square fills every pixel; iOS rejects icons with an alpha channel.
  if (svg === square) image = image.removeAlpha();
  await image.png().toFile(out);
  console.log(`${file} (${size}px)`);
}

const android = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(android)) {
  await render(round, size, `android/app/src/main/res/mipmap-${density}/ic_launcher.png`);
}

const ios = [
  ["20x20@1x", 20], ["20x20@2x", 40], ["20x20@3x", 60],
  ["29x29@1x", 29], ["29x29@2x", 58], ["29x29@3x", 87],
  ["40x40@1x", 40], ["40x40@2x", 80], ["40x40@3x", 120],
  ["60x60@2x", 120], ["60x60@3x", 180],
  ["76x76@1x", 76], ["76x76@2x", 152],
  ["83.5x83.5@2x", 167],
  ["1024x1024@1x", 1024],
];
for (const [name, size] of ios) {
  await render(square, size, `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-${name}.png`);
}

// A 1024 px master for docs, slides and app stores.
await render(square, 1024, "assets/branding/app_icon.png");
