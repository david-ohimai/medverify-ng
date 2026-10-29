/**
 * Draws the FICTIONAL demo packs used by the seed and the eval set:
 *
 *   prisma/seed/reference/X9-0001/front-1.jpg   genuine Demoquine (reference photo)
 *   eval/fixtures/*.jpg                         demo "scans": genuine, recalled, expired,
 *                                               altered label, cloned number, unregistered,
 *                                               a product with no reference, not a pack
 *
 * Every pack says "DEMO PROP — NOT A REAL MEDICINE" and uses X9- numbers,
 * which are reserved for demo data. Real packs are photographed, not drawn —
 * this only exists so the whole pipeline can be demonstrated and evaluated
 * without real photos. Regenerate with:  npx tsx scripts/generate-demo-images.ts
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

interface PackDesign {
  brand: string;
  generic: string;
  strength: string;
  form: string;
  nafdacNo: string;
  batch: string;
  mfg: string;
  exp: string;
  /** Header band and logo colour. */
  colour: string;
  /** "round" logo (genuine Demoquine) or "square" (a copy that got it wrong). */
  logo: "round" | "square";
  font?: string;
}

const DEMOQUINE: PackDesign = {
  brand: "DEMOQUINE",
  generic: "Artemether/Lumefantrine Tablets",
  strength: "20 mg/120 mg",
  form: "24 Tablets",
  nafdacNo: "X9-0001",
  batch: "DQ2401",
  mfg: "09/2024",
  exp: "08/2027",
  colour: "#1f7a4d",
  logo: "round",
};

function packSvg(d: PackDesign): string {
  const font = d.font ?? "Arial, Helvetica, sans-serif";
  const logo =
    d.logo === "round"
      ? `<circle cx="1210" cy="150" r="70" fill="#fff"/><text x="1210" y="172" text-anchor="middle" font-family="${font}" font-size="60" font-weight="700" fill="${d.colour}">MV</text>`
      : `<rect x="1140" y="85" width="140" height="130" fill="#fff"/><text x="1210" y="172" text-anchor="middle" font-family="${font}" font-size="54" font-weight="700" fill="${d.colour}">MV</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900">
  <rect width="1400" height="900" fill="#fbfbf7"/>
  <rect width="1400" height="300" fill="${d.colour}"/>
  ${logo}
  <text x="80" y="170" font-family="${font}" font-size="104" font-weight="700" fill="#fff">${d.brand}</text>
  <text x="80" y="250" font-family="${font}" font-size="46" fill="#eef">${d.strength} · ${d.form}</text>
  <text x="80" y="380" font-family="${font}" font-size="54" font-weight="700" fill="#1d2b2a">${d.generic}</text>
  <text x="80" y="450" font-family="${font}" font-size="36" fill="#445">MedVerify Demo Pharma (fictional), Lagos</text>
  <rect x="80" y="500" width="760" height="250" fill="none" stroke="#99a" stroke-width="3"/>
  <text x="110" y="560" font-family="${font}" font-size="42" fill="#1d2b2a">NAFDAC Reg. No: ${d.nafdacNo}</text>
  <text x="110" y="620" font-family="${font}" font-size="42" fill="#1d2b2a">Batch No: ${d.batch}</text>
  <text x="110" y="680" font-family="${font}" font-size="42" fill="#1d2b2a">MFG: ${d.mfg}    EXP: ${d.exp}</text>
  <text x="110" y="730" font-family="${font}" font-size="30" fill="#667">Store below 30°C. Keep out of reach of children.</text>
  <rect x="0" y="820" width="1400" height="80" fill="#c62828"/>
  <text x="700" y="874" text-anchor="middle" font-family="${font}" font-size="40" font-weight="700" fill="#fff">DEMO PROP — NOT A REAL MEDICINE</text>
</svg>`;
}

interface PhotoStyle {
  /** Degrees; a hand-held photo is never square. */
  rotate: number;
  background: string;
  brightness: number;
  blur?: number;
}

/** Turns a flat design into something like a phone photo: tilted, on a table, imperfect light. */
async function asPhoto(svg: string, style: PhotoStyle): Promise<Buffer> {
  const pack = await sharp(Buffer.from(svg))
    .rotate(style.rotate, { background: style.background })
    .modulate({ brightness: style.brightness })
    .toBuffer();
  const meta = await sharp(pack).metadata();
  let image = sharp({
    create: { width: (meta.width ?? 1400) + 160, height: (meta.height ?? 900) + 160, channels: 3, background: style.background },
  }).composite([{ input: pack, top: 80, left: 80 }]);
  if (style.blur) image = sharp(await image.png().toBuffer()).blur(style.blur);
  return image.jpeg({ quality: 82 }).toBuffer();
}

async function write(relativePath: string, data: Buffer | Promise<Buffer>): Promise<void> {
  const path = join(ROOT, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  await sharp(await data).jpeg({ quality: 85 }).toFile(path);
  console.log(`  ${relativePath}`);
}

const handHeld: PhotoStyle = { rotate: -3, background: "#8d7b68", brightness: 0.93, blur: 0.6 };

async function main(): Promise<void> {
  console.log("Writing demo images:");

  // The reference: a clean, straight photo of the genuine pack.
  await write("prisma/seed/reference/X9-0001/front-1.jpg", asPhoto(packSvg(DEMOQUINE), { rotate: 0, background: "#ffffff", brightness: 1 }));

  // Scans. Each one is a different photo (angle, light) from the reference.
  await write("eval/fixtures/demoquine-genuine.jpg", asPhoto(packSvg(DEMOQUINE), handHeld));
  await write(
    "eval/fixtures/demoquine-recalled.jpg",
    asPhoto(packSvg({ ...DEMOQUINE, batch: "DQ2310", mfg: "10/2024", exp: "09/2027" }), { ...handHeld, rotate: 2 })
  );
  await write(
    "eval/fixtures/demoquine-expired.jpg",
    asPhoto(packSvg({ ...DEMOQUINE, batch: "DQ2299", mfg: "03/2022", exp: "02/2025" }), { ...handHeld, rotate: -1.5 })
  );
  // A reprinted fake: misspellings, wrong logo shape, off colour, different font.
  await write(
    "eval/fixtures/demoquine-altered.jpg",
    asPhoto(
      packSvg({
        ...DEMOQUINE,
        brand: "DEMOQUlNE",
        generic: "Artemeter/Lumefantrin Tabelts",
        colour: "#5f8f2a",
        logo: "square",
        font: "Times New Roman, serif",
      }),
      { ...handHeld, rotate: 1 }
    )
  );
  // A real (demo) number printed on a different product's pack.
  await write(
    "eval/fixtures/cloned-number.jpg",
    asPhoto(
      packSvg({
        brand: "PARAMED DEMO",
        generic: "Paracetamol Tablets BP",
        strength: "500 mg",
        form: "100 Tablets",
        nafdacNo: "X9-0001",
        batch: "PM2402",
        mfg: "02/2024",
        exp: "01/2027",
        colour: "#1e5aa8",
        logo: "round",
      }),
      handHeld
    )
  );
  await write(
    "eval/fixtures/unregistered.jpg",
    asPhoto(
      packSvg({
        brand: "CURAMAX",
        generic: "Artemether/Lumefantrine Tablets",
        strength: "80 mg/480 mg",
        form: "6 Tablets",
        nafdacNo: "X9-0999",
        batch: "CX0001",
        mfg: "01/2025",
        exp: "12/2027",
        colour: "#7b1fa2",
        logo: "square",
      }),
      handHeld
    )
  );
  // Registered, genuine-looking, but no reference photo → confidence capped.
  await write(
    "eval/fixtures/demoxil-no-reference.jpg",
    asPhoto(
      packSvg({
        brand: "DEMOXIL",
        generic: "Amoxicillin Capsules BP",
        strength: "500 mg",
        form: "100 Capsules",
        nafdacNo: "X9-0002",
        batch: "DX2405",
        mfg: "05/2024",
        exp: "04/2027",
        colour: "#b26a00",
        logo: "round",
      }),
      handHeld
    )
  );
  // Not a pack at all.
  await write(
    "eval/fixtures/not-a-pack.jpg",
    sharp(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900">
        <rect width="1400" height="900" fill="#87b6e0"/><rect y="600" width="1400" height="300" fill="#4f8a3c"/>
        <circle cx="1100" cy="200" r="90" fill="#ffd54f"/></svg>`)
    ).toBuffer()
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
