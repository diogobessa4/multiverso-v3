var supabase;
try {
  supabase = window.supabase.createClient(
    window.__env.supabaseUrl,
    window.__env.supabaseKey
  );
} catch(err) {
  console.error('[Multiverso] ERRO createClient:', err);
  document.getElementById('produtosGrid').innerHTML = '<div class="empty-state" style="color:#ff3e6c">ERRO ao inicializar SDK.<br>Abra o console (F12).<br><small>' + err.message + '</small></div>';
}

function gerarCodigo() {
  return 'MVS-' + Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
}
function fmtPreco(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
function fmtTel(t)   { return t.replace(/\D/g,''); }
function catLabel(c) { return {hq:'HQ / Quadrinhos',manga:'Mangá',funko:'Funko Pop!',card:'Cards / TCG',acessorio:'Acessório',action_figure:'Action Figure'}[c]||c; }
function badgeClass(b){ return {new:'badge-new',hot:'badge-hot',limited:'badge-limited'}[b]||''; }
function badgeLabel(b){ return {new:'Novo',hot:'🔥 Hot',limited:'⭐ Limitado'}[b]||''; }
function statusHtml(s){
  const cls={pending:'sp',confirmed:'sc',cancelled:'sx',completed:'sd'}[s]||'sp';
  const lbl={pending:'Aguardando',confirmed:'Confirmado',cancelled:'Cancelado',completed:'Retirado'}[s]||s;
  return `<span class="sb ${cls}">${lbl}</span>`;
}

const se=document.getElementById('stars');
for(let i=0;i<120;i++){
  const s=document.createElement('div'); s.className='star';
  const sz=Math.random()*2.5+.5;
  s.style.cssText=`width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--d:${(Math.random()*4+2).toFixed(1)}s;animation-delay:${(Math.random()*5).toFixed(1)}s;`;
  se.appendChild(s);
}

let todosOsProdutos = [];
let produtoAtual    = null;
let termoBusca      = '';
const _prodMap      = {};

async function carregarProdutos(cat='todos') {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = '<div class="loader"><div class="spin"></div><div>Carregando...</div></div>';
  const t = setTimeout(() => {
    if (grid.querySelector('.spin')) grid.innerHTML = '<div class="empty-state"><div class="ei">⚠️</div><p>Não foi possível conectar ao servidor.<br><a href="#" onclick="carregarProdutos();return false" style="color:var(--neon)">Tentar novamente</a></p></div>';
  }, 8000);
  try {
    const { data, error } = await supabase.from('produtos').select('*').eq('ativo', true);
    clearTimeout(t);
    if (error) throw error;
    todosOsProdutos = data;
    todosOsProdutos.forEach(p => _prodMap[p.id] = p);
    renderLancamentos();
    renderProdutos(cat);
  } catch(e) {
    clearTimeout(t);
    grid.innerHTML = '<div class="empty-state"><div class="ei">⚠️</div><p>Erro ao carregar produtos. Verifique sua conexão.</p></div>';
  }
}

function cardHtml(p) {
  const wppTxt = encodeURIComponent(`Olá! Tenho interesse no produto: *${p.nome}*`);
  return `
    <div class="product-card">
      <div class="product-img">${p.foto ? `<img src="${p.foto}" alt="${p.nome}" loading="lazy">` : (p.emoji || '📦')}</div>
      ${p.badge ? `<span class="product-badge ${badgeClass(p.badge)}">${badgeLabel(p.badge)}</span>` : ''}
      ${p.estoque > 0 && p.estoque <= 2 ? `<span class="stock-warning">Últimas ${p.estoque}!</span>` : ''}
      <div class="product-info">
        <div class="product-cat">${catLabel(p.categoria)}</div>
        <div class="product-name">${p.nome}</div>
        <div class="product-desc">${p.descricao || ''}</div>
        <div class="product-footer">
          <div>
            <div class="product-price">${fmtPreco(p.preco)}</div>
            <div class="product-stock">${p.estoque > 0 ? `${p.estoque} disponível` + (p.estoque > 1 ? 'is' : '') : 'Esgotado'}</div>
          </div>
          <button class="btn-reserve" onclick='abrirModal("${p.id}")' ${p.estoque === 0 ? 'disabled' : ''}>
            ${p.estoque === 0 ? 'ESGOTADO' : 'RESERVAR'}
          </button>
        </div>
        <a href="https://wa.me/5521987194908?text=${wppTxt}" target="_blank" class="btn-wpp">💬 Tirar dúvida</a>
      </div>
    </div>`;
}

function renderLancamentos() {
  const novidades = todosOsProdutos.filter(p => p.badge === 'new');
  const lista = novidades.length
    ? novidades
    : [...todosOsProdutos].sort((a,b) => new Date(b.criado_em||0) - new Date(a.criado_em||0)).slice(0,4);
  const sec = document.getElementById('lancamentos');
  if (!lista.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  document.getElementById('lancamentosGrid').innerHTML = lista.map(cardHtml).join('');
}

function renderProdutos(cat) {
  const grid = document.getElementById('productsGrid');
  let lista = cat === 'todos' ? todosOsProdutos : todosOsProdutos.filter(p => p.categoria === cat);
  if (termoBusca) lista = lista.filter(p => p.nome.toLowerCase().includes(termoBusca));
  if (!lista.length) {
    grid.innerHTML = `<div class="empty-state"><div class="ei">📭</div><p>${termoBusca ? 'Nenhum produto encontrado para "' + termoBusca + '".' : 'Nenhum produto nesta categoria.'}</p></div>`;
    return;
  }
  grid.innerHTML = lista.map(cardHtml).join('');
}

window.filtrarPorNome = function(termo) {
  termoBusca = termo.trim().toLowerCase();
  const cat = document.querySelector('.cat-card.active')?.dataset.cat || 'todos';
  renderProdutos(cat);
};

window.filtrar = function(cat, el) {
  document.querySelectorAll('.cat-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  termoBusca = '';
  document.getElementById('searchProduto').value = '';
  renderProdutos(cat);
  document.getElementById('produtos').scrollIntoView({ behavior:'smooth' });
};

window.abrirModal = function(p) {
  produtoAtual = (typeof p === 'string' && _prodMap[p]) ? _prodMap[p] : (typeof p === 'string' ? JSON.parse(p) : p);
  document.getElementById('modalProduct').innerHTML = `
    <div class="modal-product-emoji">${produtoAtual.foto ? `<img src="${produtoAtual.foto}" alt="${produtoAtual.nome}" style="width:56px;height:56px;object-fit:cover;border:1px solid var(--border)">` : (produtoAtual.emoji || '📦')}</div>
    <div>
      <div class="modal-product-name">${produtoAtual.nome}</div>
      <div class="modal-product-price">${fmtPreco(produtoAtual.preco)}</div>
    </div>`;
  const hoje = new Date().toISOString().split('T')[0];
  document.getElementById('iData').min = hoje;
  document.getElementById('iData').value = '';
  document.getElementById('iNome').value = '';
  document.getElementById('iTel').value  = '';
  document.getElementById('iObs').value  = '';
  document.getElementById('fErr').textContent = '';
  document.getElementById('formContent').style.display = 'block';
  document.getElementById('successScreen').classList.remove('show');
  document.getElementById('overlay').classList.add('open');
};

window.fecharModal = function() {
  document.getElementById('overlay').classList.remove('open');
  produtoAtual = null;
  carregarProdutos(document.querySelector('.cat-card.active')?.dataset.cat || 'todos');
};

document.getElementById('overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('overlay')) window.fecharModal();
});

window.confirmarReserva = async function() {
  const nome  = document.getElementById('iNome').value.trim();
  const tel   = fmtTel(document.getElementById('iTel').value);
  const data  = document.getElementById('iData').value;
  const qtd   = parseInt(document.getElementById('iQtd').value);
  const obs   = document.getElementById('iObs').value.trim();
  const errEl = document.getElementById('fErr');
  errEl.textContent = '';

  if (!nome || !tel || !data) { errEl.textContent = 'Preencha nome, WhatsApp e data de retirada.'; return; }
  if (nome.length < 3)        { errEl.textContent = 'Nome deve ter ao menos 3 caracteres.'; return; }
  if (tel.length < 10 || tel.length > 11) { errEl.textContent = 'WhatsApp inválido. Use DDD + número (10 ou 11 dígitos).'; return; }

  const btn = document.getElementById('btnSubmit');
  btn.disabled = true; btn.textContent = 'Enviando...';

  try {
    const codigo = gerarCodigo();
    const { data: reservaId, error } = await supabase.rpc('criar_reserva', {
      p_codigo:        codigo,
      p_produto_id:    produtoAtual.id,
      p_produto_nome:  produtoAtual.nome,
      p_produto_emoji: produtoAtual.emoji || '📦',
      p_preco:         produtoAtual.preco,
      p_nome:          nome,
      p_tel:           tel,
      p_data_retirada: data,
      p_quantidade:    qtd,
      p_observacoes:   obs
    });
    if (error) throw new Error(error.message || 'Erro ao criar reserva.');

    document.getElementById('successCodigo').textContent = codigo;
    const wppMsg = encodeURIComponent(`Olá! Acabei de fazer uma reserva na Multiverso.\n\n📦 Produto: ${produtoAtual.nome}\n🔑 Código: ${codigo}\n📅 Retirada: ${new Date(data+'T12:00').toLocaleDateString('pt-BR')}\n👤 Nome: ${nome}`);
    const wppUrl = `https://wa.me/5521987194908?text=${wppMsg}`;
    document.getElementById('wppLink').href = wppUrl;
    document.getElementById('formContent').style.display = 'none';
    document.getElementById('successScreen').classList.add('show');
    setTimeout(() => window.open(wppUrl, '_blank'), 1500);
  } catch(e) {
    errEl.textContent = e.message || 'Erro ao criar reserva. Tente novamente.';
  } finally {
    btn.disabled = false; btn.textContent = '⚡ CONFIRMAR RESERVA';
  }
};

window.buscarReservas = async function() {
  const nome = document.getElementById('searchNome').value.trim();
  const container = document.getElementById('reservasContainer');
  if (!nome || nome.length < 2) {
    container.innerHTML = '<div class="empty-state"><div class="ei">⚠️</div><p>Digite ao menos 2 caracteres do seu nome.</p></div>';
    return;
  }
  container.innerHTML = '<div class="loader"><div class="spin"></div><div>Buscando...</div></div>';
  try {
    const { data, error } = await supabase.rpc('buscar_reservas', { p_nome: nome });
    if (error) throw error;
    if (!data || !data.length) {
      container.innerHTML = '<div class="empty-state"><div class="ei">📭</div><p>Nenhuma reserva encontrada para este nome.</p></div>';
      return;
    }
    const rows = data.map(r => {
      const dt = r.data_retirada ? new Date(r.data_retirada+'T12:00').toLocaleDateString('pt-BR') : '—';
      return `<tr>
        <td>${r.produto_emoji} <strong>${r.produto_nome}</strong></td>
        <td>${r.quantidade}x</td>
        <td style="font-size:.8rem">${dt}</td>
        <td>${statusHtml(r.status)}</td>
        <td>${r.status==='pending'?`<button class="btn-cancel" onclick="cancelarReserva('${r.id}','${r.produto_id}',${r.quantidade})">CANCELAR</button>`:'—'}</td>
      </tr>`;
    }).join('');
    container.innerHTML = `<div style="overflow-x:auto"><table class="reservas-table">
      <thead><tr><th>Produto</th><th>Qtd.</th><th>Retirada</th><th>Status</th><th>Ação</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  } catch(e) {
    container.innerHTML = '<div class="empty-state"><div class="ei">⚠️</div><p>Erro ao buscar. Tente novamente.</p></div>';
  }
};

window.cancelarReserva = async function(reservaId, produtoId, qtd) {
  if (!confirm('Deseja cancelar esta reserva?')) return;
  try {
    const { error } = await supabase.rpc('cancelar_reserva', { p_reserva_id: reservaId });
    if (error) throw error;
    buscarReservas();
  } catch(e) { alert('Erro ao cancelar. Tente novamente.'); }
};

carregarProdutos();
