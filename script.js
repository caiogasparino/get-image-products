import axios from "axios";
import csv from "csv-parser";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { pipeline } from "stream";
import { fileURLToPath } from "url";
import { promisify } from "util";

const streamPipeline = promisify(pipeline);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CSV renomeado
const CSV_PATH = path.join(__dirname, "product.csv");

// Lê os identificadores do CSV
async function lerIdentificadoresDoCSV() {
  return new Promise((resolve, reject) => {
    const identificadores = [];

    fs.createReadStream(CSV_PATH)
      .pipe(csv({ separator: ";", mapHeaders: ({ header }) => header.trim() }))
      .on("data", (row) => {
        const id = row["Identificador URL"]?.trim();
        if (id) identificadores.push(id);
      })
      .on("end", () => resolve(identificadores))
      .on("error", reject);
  });
}

async function baixarImagensDoProduto(identificador) {
  console.log(`🔍 Iniciando: ${identificador}`);
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  const imagensBaixadas = new Set();

  const pastaDestino = path.join("imagens", identificador);
  fs.mkdirSync(pastaDestino, { recursive: true });

  try {
    let galleryIndex = 1;

    while (true) {
      const url = `https://loja.elamor.com.br/produtos/${identificador}#product-gallery-${galleryIndex}`;
      console.log(`🖼️ Acessando: ${url}`);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

      const imagemExiste = await page
        .waitForSelector("img.fancybox__image", { timeout: 10000 })
        .then(() => true)
        .catch(() => false);

      if (!imagemExiste) {
        console.log(
          `🚫 Nenhuma imagem encontrada em gallery ${galleryIndex}. Encerrando.`
        );
        break;
      }

      const imagemURL = await page.$eval("img.fancybox__image", (img) => {
        const src = img.getAttribute("src");
        return src.startsWith("http") ? src : `https:${src}`;
      });

      if (!imagemURL.includes("-1024-1024.webp")) {
        console.log("⚠️ Imagem não é resolução completa, ignorando.");
        galleryIndex++;
        continue;
      }

      if (imagensBaixadas.has(imagemURL)) {
        console.log("♻️ Imagem repetida, encerrando.");
        break;
      }

      imagensBaixadas.add(imagemURL);

      const fileName = `${galleryIndex}-${
        path.basename(imagemURL).split("?")[0]
      }`;
      const filePath = path.join(pastaDestino, fileName);

      const response = await axios.get(imagemURL, { responseType: "stream" });
      await streamPipeline(response.data, fs.createWriteStream(filePath));

      console.log(`✅ Imagem salva: ${fileName}`);

      galleryIndex++;
    }

    await browser.close();
  } catch (err) {
    console.error(`❌ Erro com ${identificador}:`, err.message);
    await browser.close();
  }
}

async function main() {
  const identificadores = await lerIdentificadoresDoCSV();
  console.log(`📦 Total de produtos encontrados: ${identificadores.length}`);

  for (const id of identificadores) {
    await baixarImagensDoProduto(id);
  }

  console.log("🏁 Finalizado!");
}

main();
