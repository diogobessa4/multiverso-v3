# 🌌 Multiverso — Loja Geek v3.0

Sistema completo de site + reservas para a Multiverso, loja geek da Taquara, RJ.

---

## 📁 Estrutura do Projeto

```
multiverso-v3/
├── backend/
│   ├── server.js        ← API Express (toda a lógica)
│   ├── db.js            ← Banco de dados SQLite + seed inicial
│   ├── package.json
│   └── multiverso.db    ← Criado automaticamente ao rodar
│
└── frontend/
    ├── index.html       ← Site da loja (cliente)
    └── admin/
        └── index.html   ← Painel administrativo
```

---

## 🚀 Como Rodar

### 1. Instalar dependências do backend

```bash
cd backend
npm install
```

### 2. Iniciar o servidor

```bash
node server.js
```

Você verá:
```
🌌 Multiverso Backend rodando em http://localhost:3001
📦 API disponível em http://localhost:3001/api
🔑 Acesse o admin com a senha: multiverso2025
```

### 3. Abrir o site

Abra o arquivo `frontend/index.html` no navegador.
Ou use a extensão **Live Server** no VS Code (recomendado).

### 4. Acessar o painel admin

Abra `frontend/admin/index.html` e entre com a senha

---

## 🔌 Endpoints da API

### Produtos (público)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/produtos` | Listar todos os produtos |
| GET | `/api/produtos?categoria=hq` | Filtrar por categoria |
| GET | `/api/produtos/:id` | Detalhes de um produto |

### Reservas (público)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/reservas` | Criar nova reserva |
| GET | `/api/reservas/buscar?whatsapp=XXX` | Buscar reservas por WhatsApp |
| GET | `/api/reservas/codigo/:codigo` | Buscar por código |
| DELETE | `/api/reservas/:codigo` | Cancelar reserva |

### Admin (requer Bearer token)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/admin/login` | Login admin |
| GET | `/api/admin/dashboard` | Métricas e reservas recentes |
| GET | `/api/admin/reservas` | Todas as reservas |
| PUT | `/api/admin/reservas/:codigo/status` | Alterar status |
| POST | `/api/produtos` | Criar produto |
| PUT | `/api/produtos/:id` | Editar produto |
| DELETE | `/api/produtos/:id` | Desativar produto |

---

## 🎛️ Painel Admin — Funcionalidades

- **Dashboard**: total de reservas, pendentes, confirmadas, canceladas, produtos com estoque baixo
- **Reservas**: lista completa com filtros por status, alterar status (aguardando → confirmado → retirado)
- **Produtos**: editar preço, estoque, badge, emoji; desativar produto
- **Novo Produto**: cadastrar produtos diretamente pelo painel

---

## 🗄️ Banco de Dados

SQLite — arquivo `backend/multiverso.db` criado automaticamente.

**Tabelas:**
- `produtos` — catálogo da loja
- `reservas` — todas as reservas dos clientes
- `admin_config` — configurações (senha admin)

Para trocar a senha do admin, edite diretamente no SQLite:
```sql
UPDATE admin_config SET valor = 'nova_senha' WHERE chave = 'admin_password';
```
