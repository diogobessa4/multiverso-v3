require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Sessões ativas: token -> { expires: Date }
const activeSessions = new Map();

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('../frontend'));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Muitas tentativas. Tente novamente em 15 minutos.' }
});

// ─── UTILS ───────────────────────────────────────────────────────────────────

function gerarCodigo() {
  return 'MVS-' + uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase();
}

function formatWhatsApp(num) {
  return num.replace(/\D/g, '');
}

// ─── PRODUTOS ────────────────────────────────────────────────────────────────

// GET /api/produtos — listar produtos ativos
app.get('/api/produtos', (req, res) => {
  const { categoria } = req.query;
  let query = 'SELECT * FROM produtos WHERE ativo = 1';
  const params = [];
  if (categoria && categoria !== 'todos') {
    query += ' AND categoria = ?';
    params.push(categoria);
  }
  query += ' ORDER BY id ASC';
  const produtos = db.prepare(query).all(...params);
  res.json({ success: true, data: produtos });
});

// GET /api/produtos/:id
app.get('/api/produtos/:id', (req, res) => {
  const produto = db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(req.params.id);
  if (!produto) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
  res.json({ success: true, data: produto });
});

// POST /api/produtos — criar produto (admin)
app.post('/api/produtos', adminAuth, (req, res) => {
  const { nome, descricao, categoria, preco, estoque, emoji, badge } = req.body;
  if (!nome || !categoria || preco === undefined) {
    return res.status(400).json({ success: false, message: 'Campos obrigatórios: nome, categoria, preco.' });
  }
  const result = db.prepare(`
    INSERT INTO produtos (nome, descricao, categoria, preco, estoque, emoji, badge)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(nome, descricao || '', categoria, preco, estoque || 1, emoji || '📦', badge || null);

  const novo = db.prepare('SELECT * FROM produtos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, data: novo });
});

// PUT /api/produtos/:id — editar produto (admin)
app.put('/api/produtos/:id', adminAuth, (req, res) => {
  const { nome, descricao, categoria, preco, estoque, emoji, badge, ativo } = req.body;
  const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });

  db.prepare(`
    UPDATE produtos SET
      nome = ?, descricao = ?, categoria = ?, preco = ?,
      estoque = ?, emoji = ?, badge = ?, ativo = ?
    WHERE id = ?
  `).run(
    nome ?? produto.nome,
    descricao ?? produto.descricao,
    categoria ?? produto.categoria,
    preco ?? produto.preco,
    estoque ?? produto.estoque,
    emoji ?? produto.emoji,
    badge ?? produto.badge,
    ativo !== undefined ? ativo : produto.ativo,
    req.params.id
  );

  res.json({ success: true, data: db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id) });
});

// DELETE /api/produtos/:id — desativar produto (soft delete)
app.delete('/api/produtos/:id', adminAuth, (req, res) => {
  db.prepare('UPDATE produtos SET ativo = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Produto desativado.' });
});

// ─── RESERVAS ────────────────────────────────────────────────────────────────

// POST /api/reservas — criar reserva (cliente)
app.post('/api/reservas', (req, res) => {
  const { produto_id, nome, whatsapp, data_retirada, quantidade, observacoes } = req.body;

  if (!produto_id || !nome || !whatsapp || !data_retirada) {
    return res.status(400).json({ success: false, message: 'Preencha: produto_id, nome, whatsapp e data_retirada.' });
  }

  const wpp = formatWhatsApp(whatsapp);
  if (wpp.length < 10 || wpp.length > 11) {
    return res.status(400).json({ success: false, message: 'WhatsApp inválido. Use DDD + número (10 ou 11 dígitos).' });
  }

  if (nome.trim().length < 3) {
    return res.status(400).json({ success: false, message: 'Nome deve ter ao menos 3 caracteres.' });
  }

  const produto = db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(produto_id);
  if (!produto) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });

  const qtd = quantidade || 1;
  if (produto.estoque < qtd) {
    return res.status(400).json({ success: false, message: `Estoque insuficiente. Disponível: ${produto.estoque}` });
  }

  const codigo = gerarCodigo();

  // Cria reserva e desconta estoque em transação atômica
  const criar = db.transaction(() => {
    db.prepare(`
      INSERT INTO reservas (codigo, produto_id, nome, whatsapp, data_retirada, quantidade, observacoes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(codigo, produto_id, nome.trim(), wpp, data_retirada, qtd, observacoes || '');

    db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(qtd, produto_id);
  });
  criar();

  const reserva = db.prepare(`
    SELECT r.*, p.nome as produto_nome, p.emoji, p.preco
    FROM reservas r JOIN produtos p ON r.produto_id = p.id
    WHERE r.codigo = ?
  `).get(codigo);

  res.status(201).json({ success: true, data: reserva });
});

// GET /api/reservas/buscar?whatsapp=XXX — cliente busca suas reservas
app.get('/api/reservas/buscar', (req, res) => {
  const { whatsapp } = req.query;
  if (!whatsapp) return res.status(400).json({ success: false, message: 'Informe o whatsapp.' });

  const reservas = db.prepare(`
    SELECT r.*, p.nome as produto_nome, p.emoji, p.preco
    FROM reservas r JOIN produtos p ON r.produto_id = p.id
    WHERE r.whatsapp = ?
    ORDER BY r.criado_em DESC
  `).all(formatWhatsApp(whatsapp));

  res.json({ success: true, data: reservas });
});

// GET /api/reservas/codigo/:codigo — buscar por código
app.get('/api/reservas/codigo/:codigo', (req, res) => {
  const reserva = db.prepare(`
    SELECT r.*, p.nome as produto_nome, p.emoji, p.preco
    FROM reservas r JOIN produtos p ON r.produto_id = p.id
    WHERE r.codigo = ?
  `).get(req.params.codigo.toUpperCase());

  if (!reserva) return res.status(404).json({ success: false, message: 'Reserva não encontrada.' });
  res.json({ success: true, data: reserva });
});

// DELETE /api/reservas/:codigo — cancelar reserva (cliente)
app.delete('/api/reservas/:codigo', (req, res) => {
  const reserva = db.prepare('SELECT * FROM reservas WHERE codigo = ?').get(req.params.codigo.toUpperCase());
  if (!reserva) return res.status(404).json({ success: false, message: 'Reserva não encontrada.' });
  if (reserva.status === 'cancelled') return res.status(400).json({ success: false, message: 'Reserva já cancelada.' });

  const cancelar = db.transaction(() => {
    db.prepare("UPDATE reservas SET status = 'cancelled' WHERE codigo = ?").run(reserva.codigo);
    db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(reserva.quantidade, reserva.produto_id);
  });
  cancelar();

  res.json({ success: true, message: 'Reserva cancelada e estoque restaurado.' });
});

// ─── ADMIN ───────────────────────────────────────────────────────────────────

// POST /api/admin/login
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  const { senha } = req.body;
  if (!senha) return res.status(400).json({ success: false, message: 'Senha obrigatória.' });

  const config = db.prepare("SELECT valor FROM admin_config WHERE chave = 'admin_password'").get();
  if (!config) return res.status(500).json({ success: false, message: 'Configuração não encontrada.' });

  const match = await bcrypt.compare(senha, config.valor);
  if (!match) return res.status(401).json({ success: false, message: 'Senha incorreta.' });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 horas
  activeSessions.set(token, { expires });

  res.json({ success: true, token });
});

// POST /api/admin/logout
app.post('/api/admin/logout', (req, res) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.replace('Bearer ', '');
    activeSessions.delete(token);
  }
  res.json({ success: true, message: 'Logout efetuado.' });
});

// GET /api/admin/reservas — todas as reservas
app.get('/api/admin/reservas', adminAuth, (req, res) => {
  const { status, data } = req.query;
  let query = `
    SELECT r.*, p.nome as produto_nome, p.emoji, p.preco
    FROM reservas r JOIN produtos p ON r.produto_id = p.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { query += ' AND r.status = ?'; params.push(status); }
  if (data) { query += ' AND r.data_retirada = ?'; params.push(data); }
  query += ' ORDER BY r.criado_em DESC';
  const reservas = db.prepare(query).all(...params);
  res.json({ success: true, data: reservas });
});

// PUT /api/admin/reservas/:codigo/status — alterar status
app.put('/api/admin/reservas/:codigo/status', adminAuth, (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'confirmed', 'cancelled', 'completed'];
  if (!valid.includes(status)) return res.status(400).json({ success: false, message: 'Status inválido.' });

  const reserva = db.prepare('SELECT * FROM reservas WHERE codigo = ?').get(req.params.codigo.toUpperCase());
  if (!reserva) return res.status(404).json({ success: false, message: 'Reserva não encontrada.' });

  // Se cancelando via admin, devolve estoque
  if (status === 'cancelled' && reserva.status !== 'cancelled') {
    db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(reserva.quantidade, reserva.produto_id);
  }

  db.prepare('UPDATE reservas SET status = ? WHERE codigo = ?').run(status, reserva.codigo);
  res.json({ success: true, message: `Status atualizado para: ${status}` });
});

// GET /api/admin/dashboard — métricas
app.get('/api/admin/dashboard', adminAuth, (req, res) => {
  const totalReservas = db.prepare("SELECT COUNT(*) as n FROM reservas").get().n;
  const reservasPendentes = db.prepare("SELECT COUNT(*) as n FROM reservas WHERE status='pending'").get().n;
  const reservasConfirmadas = db.prepare("SELECT COUNT(*) as n FROM reservas WHERE status='confirmed'").get().n;
  const reservasCanceladas = db.prepare("SELECT COUNT(*) as n FROM reservas WHERE status='cancelled'").get().n;
  const totalProdutos = db.prepare("SELECT COUNT(*) as n FROM produtos WHERE ativo=1").get().n;
  const produtosBaixoEstoque = db.prepare("SELECT COUNT(*) as n FROM produtos WHERE ativo=1 AND estoque <= 2").get().n;
  const recentes = db.prepare(`
    SELECT r.*, p.nome as produto_nome, p.emoji
    FROM reservas r JOIN produtos p ON r.produto_id = p.id
    ORDER BY r.criado_em DESC LIMIT 5
  `).all();

  res.json({
    success: true,
    data: {
      totalReservas, reservasPendentes, reservasConfirmadas, reservasCanceladas,
      totalProdutos, produtosBaixoEstoque, recentes
    }
  });
});

// ─── MIDDLEWARE DE AUTH ───────────────────────────────────────────────────────

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Não autorizado.' });
  }
  const token = auth.replace('Bearer ', '');
  const session = activeSessions.get(token);
  if (!session || session.expires < new Date()) {
    activeSessions.delete(token);
    return res.status(401).json({ success: false, message: 'Sessão expirada ou inválida.' });
  }
  next();
}

// ─── START ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🌌 Multiverso Backend rodando em http://localhost:${PORT}`);
  console.log(`📦 API disponível em http://localhost:${PORT}/api\n`);
});
