require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'multiverso.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// ─── SCHEMA ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS produtos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT    NOT NULL,
    descricao   TEXT,
    categoria   TEXT    NOT NULL,
    preco       REAL    NOT NULL,
    estoque     INTEGER NOT NULL DEFAULT 1,
    emoji       TEXT    DEFAULT '📦',
    badge       TEXT    DEFAULT NULL,
    ativo       INTEGER NOT NULL DEFAULT 1,
    criado_em   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS reservas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo      TEXT    NOT NULL UNIQUE,
    produto_id  INTEGER NOT NULL,
    nome        TEXT    NOT NULL,
    whatsapp    TEXT    NOT NULL,
    data_retirada TEXT  NOT NULL,
    quantidade  INTEGER NOT NULL DEFAULT 1,
    observacoes TEXT,
    status      TEXT    NOT NULL DEFAULT 'pending',
    criado_em   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  );

  CREATE TABLE IF NOT EXISTS admin_config (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );
`);

// ─── SEED: produtos iniciais ─────────────────────────────────────────────────

const count = db.prepare('SELECT COUNT(*) as n FROM produtos').get();
if (count.n === 0) {
  const insert = db.prepare(`
    INSERT INTO produtos (nome, descricao, categoria, preco, estoque, emoji, badge)
    VALUES (@nome, @descricao, @categoria, @preco, @estoque, @emoji, @badge)
  `);

  const seed = db.transaction(() => {
    insert.run({ nome: 'Batman: Ano Um', descricao: 'A obra-prima de Frank Miller que redefiniu o Batman moderno. Edição especial capa dura.', categoria: 'hq', preco: 89.90, estoque: 5, emoji: '📚', badge: 'hot' });
    insert.run({ nome: 'X-Men: Fênix Negra', descricao: 'A saga mais épica dos X-Men em uma edição deluxe. Imperdível para colecionadores.', categoria: 'hq', preco: 120.00, estoque: 3, emoji: '📚', badge: 'new' });
    insert.run({ nome: 'Saga Completa Watchmen', descricao: 'Edição definitiva da obra de Alan Moore. Capa dura com slipcase.', categoria: 'hq', preco: 199.90, estoque: 2, emoji: '📚', badge: 'new' });
    insert.run({ nome: 'Demon Slayer Vol. 1–5', descricao: 'Box especial dos primeiros 5 volumes de Kimetsu no Yaiba. Edição JBC.', categoria: 'manga', preco: 149.90, estoque: 4, emoji: '📖', badge: 'hot' });
    insert.run({ nome: 'Berserk Vol. 41', descricao: 'Volume especial com arte exclusiva. Edição limitada comemorativa.', categoria: 'manga', preco: 65.00, estoque: 2, emoji: '📖', badge: 'limited' });
    insert.run({ nome: 'Jujutsu Kaisen Vol. 0', descricao: 'O volume de origem que deu início a tudo. Capa especial exclusiva.', categoria: 'manga', preco: 42.00, estoque: 6, emoji: '📖', badge: 'hot' });
    insert.run({ nome: 'Funko Pop! Goku SSJ', descricao: 'Dragon Ball Z — Goku Super Saiyajin em modo de combate. N° 121.', categoria: 'funko', preco: 159.90, estoque: 3, emoji: '🎭', badge: 'new' });
    insert.run({ nome: 'Funko Pop! Geralt', descricao: 'The Witcher — Geralt de Rívia com espada de prata. Edição exclusiva.', categoria: 'funko', preco: 189.90, estoque: 1, emoji: '🎭', badge: 'limited' });
    insert.run({ nome: 'Booster Pokémon SV', descricao: 'Pacote com 10 cartas da coleção Scarlet & Violet. Pode conter cartas raras EX!', categoria: 'card', preco: 35.00, estoque: 20, emoji: '🃏', badge: 'hot' });
    insert.run({ nome: 'Deck Inicial Magic', descricao: 'Deck Commander pronto para jogar. Ideal para iniciantes e veteranos.', categoria: 'card', preco: 79.90, estoque: 5, emoji: '🃏', badge: 'new' });
    insert.run({ nome: 'Poster A3 Evangelion', descricao: 'Poster em papel couché 300g com acabamento fosco. Arte oficial do anime.', categoria: 'acessorio', preco: 45.00, estoque: 10, emoji: '🎮', badge: 'new' });
    insert.run({ nome: 'Pin Mandalorian', descricao: 'This is the way! Pin metálico esmaltado de alta qualidade.', categoria: 'acessorio', preco: 29.90, estoque: 15, emoji: '🎮', badge: 'hot' });
  });
  seed();
  console.log('✅ Banco de dados populado com produtos iniciais.');
}

// ─── SEED: admin config ───────────────────────────────────────────────────────

const adminPass = db.prepare("SELECT valor FROM admin_config WHERE chave='admin_password'").get();

if (!adminPass) {
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) {
    console.error('❌ ADMIN_PASSWORD não definido no arquivo .env! Crie o arquivo .env com base no .env.example antes de iniciar.');
    process.exit(1);
  }
  const hash = bcrypt.hashSync(senha, 12);
  db.prepare("INSERT INTO admin_config (chave, valor) VALUES ('admin_password', ?)").run(hash);
  console.log('✅ Senha admin configurada via ADMIN_PASSWORD.');
} else if (!adminPass.valor.startsWith('$2')) {
  // Migrar senha em texto puro para bcrypt
  const hash = bcrypt.hashSync(adminPass.valor, 12);
  db.prepare("UPDATE admin_config SET valor = ? WHERE chave = 'admin_password'").run(hash);
  console.log('✅ Senha admin migrada para bcrypt.');
}

module.exports = db;
