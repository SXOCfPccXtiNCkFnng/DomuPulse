// Gera a marca e os ícones do app a partir das logos da DomuTech em
// public/icons (favicon.ico é o "D" azul em PNG; logobranca.png, o branco).
// Rode com: npm run icons
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const NAVY = "#0f2a5f";
const BLUE_MARK = "public/icons/favicon.ico";
const WHITE_MARK = "public/icons/logobranca.png";

await mkdir("public/brand", { recursive: true });

// Marca recortada, sem margem transparente, para usar na interface.
await sharp(BLUE_MARK).trim().resize(256, 256, { fit: "contain", background: "#0000" }).png().toFile("public/brand/mark.png");
await sharp(WHITE_MARK).trim().resize(256, 256, { fit: "contain", background: "#0000" }).png().toFile("public/brand/mark-white.png");

// Ícone quadrado: "D" branco sobre azul-marinho. `scale` é quanto do lado a
// marca ocupa (os ícones "maskable" precisam de margem para o recorte).
async function tile(size, scale, path) {
  const inner = Math.round(size * scale);
  const mark = await sharp(WHITE_MARK).trim().resize(inner, inner, { fit: "contain", background: "#0000" }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(path);
  console.log(`ok ${path}`);
}

await tile(192, 0.56, "public/icons/icon-192.png");
await tile(512, 0.56, "public/icons/icon-512.png");
await tile(512, 0.44, "public/icons/icon-maskable-512.png");
await tile(180, 0.56, "src/app/apple-icon.png");

// Badge do Android: só o canal alfa é usado, então vai a marca branca sem fundo.
await sharp(WHITE_MARK).trim().resize(80, 80, { fit: "contain", background: "#0000" }).extend({ top: 8, bottom: 8, left: 8, right: 8, background: "#0000" }).png().toFile("public/icons/badge-96.png");
console.log("ok public/icons/badge-96.png");

// Favicon da aba do navegador: o "D" azul, que aparece bem no claro e no escuro.
await sharp(BLUE_MARK).trim().resize(256, 256, { fit: "contain", background: "#0000" }).png().toFile("src/app/icon.png");
console.log("ok src/app/icon.png");
