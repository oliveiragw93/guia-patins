#!/usr/bin/env node
/* ================================================================
   build.js — gera as duas versões publicáveis a partir de UMA fonte só.

   shared/index.html  →  public/index.html  (Cloudflare — mesma origem do Worker)
                      →  docs/index.html    (GitHub Pages / app Android — origem
                                              diferente, precisa da URL completa)

   Roda sempre que quiser atualizar qualquer uma das duas publicações:
     node build.js
   Depois, publica só o que quiser:
     npx wrangler deploy        (Cloudflare — só usa public/, wrangler.jsonc, worker.js)
     git add . && git commit -m "..." && git push   (GitHub — só usa docs/, android/)
   Rodar um nunca afeta o outro — são ferramentas diferentes olhando pastas diferentes.
   ================================================================ */

const fs = require('fs');
const path = require('path');

const WORKER_URL = 'https://guia-patins.oliveiragw93.workers.dev/api';

const SHARED_DIR = path.join(__dirname, 'shared');
const PUBLIC_DIR = path.join(__dirname, 'public');   // Cloudflare
const DOCS_DIR = path.join(__dirname, 'docs');       // GitHub Pages / Capacitor

const OVERRIDE_LINE_PATTERN = /window\.SYNC_API_OVERRIDE\s*=\s*[^;]+;[^\n]*/;

function readShared(filename) {
  return fs.readFileSync(path.join(SHARED_DIR, filename), 'utf8');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyStaticAsset(filename) {
  const src = path.join(SHARED_DIR, filename);
  if (!fs.existsSync(src)) return;
  fs.copyFileSync(src, path.join(PUBLIC_DIR, filename));
  fs.copyFileSync(src, path.join(DOCS_DIR, filename));
}

function build() {
  ensureDir(PUBLIC_DIR);
  ensureDir(DOCS_DIR);

  const baseHtml = readShared('index.html');
  if (!OVERRIDE_LINE_PATTERN.test(baseHtml)) {
    console.error('✗ Não encontrei a linha SYNC_API_OVERRIDE em shared/index.html — build cancelado.');
    process.exit(1);
  }

  // Cloudflare: mesma origem do Worker, caminho relativo funciona
  const cloudflareHtml = baseHtml.replace(OVERRIDE_LINE_PATTERN, "window.SYNC_API_OVERRIDE = null; // gerado por build.js — versão Cloudflare (mesma origem)");
  fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), cloudflareHtml);

  // GitHub Pages / app Android: origem diferente, precisa da URL completa
  const githubHtml = baseHtml.replace(OVERRIDE_LINE_PATTERN, `window.SYNC_API_OVERRIDE = '${WORKER_URL}'; // gerado por build.js — versão GitHub/Android`);
  fs.writeFileSync(path.join(DOCS_DIR, 'index.html'), githubHtml);

  // arquivos que são idênticos nas duas publicações
  ['manifest.json', 'sw.js', 'icon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png']
    .forEach(copyStaticAsset);

  console.log('✓ public/index.html gerado (Cloudflare — override relativo)');
  console.log('✓ docs/index.html gerado (GitHub/Android — override:', WORKER_URL + ')');
  console.log('✓ manifest.json, sw.js e ícones copiados pras duas pastas');
  console.log('\nPróximo passo — publica o que precisar:');
  console.log('  npx wrangler deploy                                   (Cloudflare)');
  console.log('  git add . && git commit -m "..." && git push          (GitHub/Android)');
}

build();
