// Gera os ícones do PWA a partir da marca. Rode com: npm run icons
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const BRAND = "#0f2a5f";
const INK = "#ffffff";
const LINE = "M5 17h5.5l2.5-6 4 12 3-9 1.8 3H27";

// scale < 1 encolhe o traço para caber na área segura dos ícones "maskable".
const icon = ({ rounded, scale = 1, bg = BRAND, stroke = INK }) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  ${bg ? `<rect width="32" height="32" rx="${rounded ? 9 : 0}" fill="${bg}"/>` : ""}
  <g transform="translate(16 16) scale(${scale}) translate(-16 -16)">
    <path d="${LINE}" fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

const outputs = [
  ["public/icons/icon-192.png", 192, icon({ rounded: false })],
  ["public/icons/icon-512.png", 512, icon({ rounded: false })],
  ["public/icons/icon-maskable-512.png", 512, icon({ rounded: false, scale: 0.72 })],
  // Badge do Android: só o canal alfa é usado, então o traço vai em branco sem fundo.
  ["public/icons/badge-96.png", 96, icon({ rounded: false, bg: null, stroke: "#ffffff", scale: 1.1 })],
  ["src/app/apple-icon.png", 180, icon({ rounded: false, scale: 0.85 })],
];

await mkdir("public/icons", { recursive: true });
for (const [path, size, svg] of outputs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path);
  console.log(`ok ${path}`);
}
await writeFile("src/app/icon.svg", icon({ rounded: true }).trim() + "\n");
console.log("ok src/app/icon.svg");
