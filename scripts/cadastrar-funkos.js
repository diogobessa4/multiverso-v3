// Cadastrador em lote de Funkos.
// Lê imagens de ./imagens/, sobe pro bucket Supabase Storage "produtos"
// e cria registros em public.produtos. Usa service_role (bypassa RLS).
// Pré-requisitos: .env.local com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { lookup as lookupMime } from 'mime-types';
import { config as dotenvConfig } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IMAGENS_DIR = join(ROOT, 'imagens');
const CADASTRADOS_DIR = join(IMAGENS_DIR, 'cadastrados');
const VALID_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const CATEGORIA = 'funko';
const PRECO = 0.01;
const ESTOQUE = 1;
const EMOJI = '';

dotenvConfig({ path: join(ROOT, '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ ERRO: SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY ausentes em .env.local');
  console.error('   Crie/preencha o arquivo na raiz do projeto e tente de novo.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function parseFilename(filename) {
  const ext = extname(filename).toLowerCase();
  let base = basename(filename, ext);
  base = base.replace(/_/g, ' ');
  base = base.replace(/\b(funko-?pop|funko|pop)\b/gi, ' ');
  base = base.replace(/\s*-+\s+|\s+-+\s*/g, ' ');
  base = base.replace(/^-+|-+$/g, '');
  base = base.replace(/\s+/g, ' ').trim();

  if (!base) {
    return { nome: '', skip: true, reason: 'nome vazio após parsing' };
  }

  const nome = base.split(' ').filter(Boolean).map(titleCaseToken).join(' ');
  return { nome, skip: false };
}

function titleCaseToken(token) {
  return token.replace(/[a-zA-Z0-9]+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function listImages() {
  if (!existsSync(IMAGENS_DIR)) {
    console.error(`❌ Pasta não existe: ${IMAGENS_DIR}`);
    process.exit(1);
  }
  return readdirSync(IMAGENS_DIR)
    .filter(name => {
      const full = join(IMAGENS_DIR, name);
      try { return statSync(full).isFile(); } catch { return false; }
    })
    .filter(name => VALID_EXTS.has(extname(name).toLowerCase()))
    .sort();
}

function buildPreview(files) {
  return files.map(file => {
    const parsed = parseFilename(file);
    return {
      file,
      nome: parsed.nome,
      skip: parsed.skip,
      reason: parsed.reason || null,
      categoria: CATEGORIA,
      preco: PRECO,
      estoque: ESTOQUE
    };
  });
}

function printPreview(items) {
  const validos = items.filter(i => !i.skip);
  const pulados = items.filter(i => i.skip);

  const colFile = Math.max(7, ...items.map(i => i.file.length));
  const colNome = Math.max(4, ...items.map(i => (i.nome || '(skip)').length));
  const sep = `+-${'-'.repeat(colFile)}-+-${'-'.repeat(colNome)}-+----------+--------+---------+`;

  console.log('\n📋 PREVIEW DO CADASTRO\n');
  console.log(sep);
  console.log(`| ${pad('Arquivo', colFile)} | ${pad('Nome', colNome)} | Categoria | Preço  | Estoque |`);
  console.log(sep);
  for (const i of items) {
    const nomeShown = i.skip ? `(SKIP: ${i.reason})` : i.nome;
    console.log(`| ${pad(i.file, colFile)} | ${pad(nomeShown, colNome)} | ${pad(i.categoria, 9)} | ${pad(i.preco.toFixed(2), 6)} | ${pad(String(i.estoque), 7)} |`);
  }
  console.log(sep);
  console.log(`\nTotal: ${items.length} | Válidos: ${validos.length} | Pulados: ${pulados.length}\n`);
  return { validos, pulados };
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function ask(question) {
  const rl = createInterface({ input, output });
  try { return (await rl.question(question)).trim(); }
  finally { rl.close(); }
}

async function uploadAndInsert(item) {
  const filePath = join(IMAGENS_DIR, item.file);
  const ext = extname(item.file).toLowerCase();
  const buffer = readFileSync(filePath);
  const contentType = lookupMime(ext) || 'application/octet-stream';
  const storagePath = `${randomUUID()}${ext}`;

  const { error: upErr } = await supabase
    .storage
    .from('produtos')
    .upload(storagePath, buffer, { contentType, upsert: false, cacheControl: '3600' });

  if (upErr) return { ok: false, stage: 'upload', error: upErr.message };

  const { data: pub } = supabase.storage.from('produtos').getPublicUrl(storagePath);
  const publicUrl = pub.publicUrl;

  const { error: insErr } = await supabase.from('produtos').insert({
    nome: item.nome,
    categoria: CATEGORIA,
    preco: PRECO,
    estoque: ESTOQUE,
    foto: publicUrl,
    emoji: EMOJI,
    numero_serie: null,
    ativo: true
  });

  if (insErr) {
    await supabase.storage.from('produtos').remove([storagePath]);
    return { ok: false, stage: 'insert', error: insErr.message, rolledBack: true };
  }

  if (!existsSync(CADASTRADOS_DIR)) mkdirSync(CADASTRADOS_DIR, { recursive: true });
  try {
    renameSync(filePath, join(CADASTRADOS_DIR, item.file));
  } catch (mvErr) {
    return { ok: true, warning: `cadastrado mas falha ao mover arquivo: ${mvErr.message}` };
  }

  return { ok: true, publicUrl };
}

async function main() {
  const files = listImages();
  if (!files.length) {
    console.log('Nenhuma imagem encontrada em ./imagens/');
    return;
  }

  const items = buildPreview(files);
  const { validos, pulados } = printPreview(items);

  if (!validos.length) {
    console.log('Nada a cadastrar.');
    return;
  }

  const ans = await ask(`Confirmar cadastro de ${validos.length} produtos? (s/N): `);
  if (ans.toLowerCase() !== 's') {
    console.log('Abortado pelo usuário.');
    return;
  }

  let okCount = 0;
  const falhas = [];
  for (const item of validos) {
    process.stdout.write(`→ ${item.file} ... `);
    try {
      const result = await uploadAndInsert(item);
      if (result.ok) {
        okCount++;
        console.log(result.warning ? `⚠️  ${result.warning}` : '✅');
      } else {
        falhas.push({ file: item.file, stage: result.stage, error: result.error, rolledBack: result.rolledBack });
        console.log(`❌ [${result.stage}] ${result.error}${result.rolledBack ? ' (upload removido)' : ''}`);
      }
    } catch (err) {
      falhas.push({ file: item.file, stage: 'exception', error: err.message });
      console.log(`❌ exceção: ${err.message}`);
    }
  }

  console.log('\n=== RESUMO ===');
  console.log(`✅ Cadastrados: ${okCount}`);
  console.log(`⚠️  Pulados (parsing inválido): ${pulados.length}`);
  if (pulados.length) pulados.forEach(p => console.log(`   • ${p.file} (${p.reason})`));
  console.log(`❌ Falhas: ${falhas.length}`);
  if (falhas.length) falhas.forEach(f => console.log(`   • ${f.file} [${f.stage}] ${f.error}`));
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
