const MAX_FILE_SIZE = 5 * 1024 * 1024;

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

var supabase;
try {
  supabase = window.supabase.createClient(
    window.__env.supabaseUrl,
    window.__env.supabaseKey
  );
} catch(err) {
  console.error('[Multiverso] ERRO createClient:', err);
  document.getElementById('loadingScreen').innerHTML = '<div style="color:#ff3e6c;padding:2rem;text-align:center;font-family:monospace">ERRO ao inicializar SDK.<br>Abra o console do navegador (F12).<br><small>' + err.message + '</small></div>';
}

async function isAutorizado(email) {
  if (!email) return false;
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('ativo', true);
    return !error && data && data.length > 0;
  } catch(e) {
    return false;
  }
}

window.loginComGoogle = async function() {
  document.getElementById('loginErr').textContent = '';
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    });
    if (error) throw error;
  } catch(e) {
    document.getElementById('loginErr').textContent = e.message || 'Erro ao iniciar login com Google.';
  }
};

var _authInitTimeout = setTimeout(function() {
  document.getElementById('loadingScreen').classList.add('hide');
  document.getElementById('loginScreen').classList.add('show');
}, 5000);

supabase.auth.onAuthStateChange(async function(event, session) {
  clearTimeout(_authInitTimeout);
  if (session && session.user) {
    var user = session.user;
    var autorizado = await isAutorizado(user.email);
    document.getElementById('loadingScreen').classList.add('hide');
    if (autorizado) {
      document.getElementById('loginScreen').classList.remove('show');
      document.getElementById('adminLayout').classList.add('show');
      document.getElementById('userEmail').textContent = user.email;
      document.getElementById('acessoNegado').classList.remove('show');
      carregarDashboard();
    } else {
      document.getElementById('loginScreen').classList.add('show');
      document.getElementById('adminLayout').classList.remove('show');
      document.getElementById('acessoNegado').classList.add('show');
      document.getElementById('emailNegado').textContent = user.email;
    }
  } else {
    document.getElementById('loadingScreen').classList.add('hide');
    document.getElementById('loginScreen').classList.add('show');
    document.getElementById('adminLayout').classList.remove('show');
    document.getElementById('acessoNegado').classList.remove('show');
  }
});

window.logout = async function() {
  await supabase.auth.signOut();
};

var abaAtual = 'dashboard';
var filtroStatusAtual = '';
var statusReservaId = '';

function fmtPreco(v) {
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

function statusHtml(s) {
  var cls = {pending:'sp', confirmed:'sc', cancelled:'sx', completed:'sd'}[s] || 'sp';
  var lbl = {pending:'Aguardando', confirmed:'Confirmado', cancelled:'Cancelado', completed:'Retirado'}[s] || s;
  return '<span class="sb ' + cls + '">' + lbl + '</span>';
}

function badgeHtml(b) {
  if (!b) return '';
  var cls = {hot:'badge-hot', new:'badge-new', limited:'badge-limited'}[b] || '';
  var lbl = {hot:'Hot', new:'Novo', limited:'Limitado'}[b] || b;
  return '<span class="' + cls + '">' + lbl + '</span>';
}

function stockCls(n) {
  return n === 0 ? 'stock-zero' : n <= 2 ? 'stock-low' : 'stock-ok';
}

window.irPara = function(aba, el) {
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  if (el) el.classList.add('active');
  document.getElementById('tab-' + aba).classList.add('active');
  var titles = {dashboard:'Dashboard', reservas:'Reservas', produtos:'Produtos', novo:'Novo Produto'};
  var subs   = {dashboard:'Visao geral', reservas:'Gerenciar reservas', produtos:'Gerenciar catalogo', novo:'Adicionar produto'};
  document.getElementById('tTitle').textContent = titles[aba] || aba;
  document.getElementById('tSub').textContent   = subs[aba] || '';
  abaAtual = aba;
  if (aba === 'dashboard') carregarDashboard();
  if (aba === 'reservas')  carregarReservas('');
  if (aba === 'produtos')  carregarProdutos();
};

window.recarregar = function() { window.irPara(abaAtual, null); };

async function carregarDashboard() {
  try {
    var resResult  = await supabase.from('reservas').select('*');
    var prodResult = await supabase.from('produtos').select('*').eq('ativo', true);
    var reservas = resResult.data || [];
    var produtos  = prodResult.data || [];

    var pending   = reservas.filter(function(r){return r.status==='pending';}).length;
    var confirmed = reservas.filter(function(r){return r.status==='confirmed';}).length;
    var cancelled = reservas.filter(function(r){return r.status==='cancelled';}).length;
    var baixo     = produtos.filter(function(p){return p.estoque<=2;}).length;

    document.getElementById('statsGrid').innerHTML =
      '<div class="stat blue"><div class="stat-icon">📋</div><div class="stat-val">' + reservas.length + '</div><div class="stat-lbl">Total Reservas</div></div>' +
      '<div class="stat yellow"><div class="stat-icon">⏳</div><div class="stat-val">' + pending + '</div><div class="stat-lbl">Aguardando</div></div>' +
      '<div class="stat green"><div class="stat-icon">✅</div><div class="stat-val">' + confirmed + '</div><div class="stat-lbl">Confirmadas</div></div>' +
      '<div class="stat red"><div class="stat-icon">❌</div><div class="stat-val">' + cancelled + '</div><div class="stat-lbl">Canceladas</div></div>' +
      '<div class="stat purple"><div class="stat-icon">📦</div><div class="stat-val">' + produtos.length + '</div><div class="stat-lbl">Produtos</div></div>' +
      '<div class="stat yellow"><div class="stat-icon">⚠️</div><div class="stat-val">' + baixo + '</div><div class="stat-lbl">Estoque Baixo</div></div>';

    var recentes = reservas.slice().sort(function(a,b){ return new Date(b.criado_em||0) - new Date(a.criado_em||0); }).slice(0, 6);
    var rows = recentes.map(function(r) {
      var data = r.criado_em ? new Date(r.criado_em).toLocaleDateString('pt-BR') : '--';
      return '<tr><td><span style="font-family:\'Orbitron\',monospace;color:var(--gold);font-size:.75rem">' + escHtml(r.codigo) + '</span></td>' +
             '<td>' + escHtml(r.produto_emoji||'') + ' ' + escHtml(r.produto_nome||'') + '</td>' +
             '<td>' + escHtml(r.nome) + '</td>' +
             '<td>' + statusHtml(r.status) + '</td>' +
             '<td style="font-size:.75rem;color:var(--muted)">' + data + '</td></tr>';
    }).join('');

    document.getElementById('tRecentes').innerHTML =
      '<thead><tr><th>Codigo</th><th>Produto</th><th>Cliente</th><th>Status</th><th>Data</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--muted)">Nenhuma reserva ainda.</td></tr>') + '</tbody>';
  } catch(e) { console.error(e); }
}

var reservasCached = [];
var termoBuscaAdmin = '';

function renderTabelaReservas(lista) {
  var wrap = document.getElementById('reservasWrap');
  if (!lista.length) { wrap.innerHTML = '<div class="empty">Nenhuma reserva encontrada.</div>'; return; }
  var rows = lista.map(function(r) {
    var data = r.data_retirada ? new Date(r.data_retirada + 'T12:00').toLocaleDateString('pt-BR') : '--';
    return '<tr>' +
      '<td><span style="font-family:\'Orbitron\',monospace;color:var(--gold);font-size:.75rem">' + escHtml(r.codigo) + '</span></td>' +
      '<td>' + escHtml(r.produto_emoji||'') + ' ' + escHtml(r.produto_nome||'') + '</td>' +
      '<td>' + escHtml(r.nome) + '</td>' +
      '<td style="font-size:.8rem;color:var(--muted)">' + escHtml(r.tel||'') + '</td>' +
      '<td style="font-size:.8rem">' + data + '</td>' +
      '<td>' + escHtml(r.quantidade) + 'x</td>' +
      '<td>' + statusHtml(r.status) + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" onclick="abrirStatus(\'' + escHtml(r.id) + '\',\'' + escHtml(r.status) + '\',\'' + escHtml(r.codigo) + '\')">Editar</button></td>' +
      '</tr>';
  }).join('');
  wrap.innerHTML = '<table><thead><tr><th>Codigo</th><th>Produto</th><th>Cliente</th><th>WhatsApp</th><th>Retirada</th><th>Qtd</th><th>Status</th><th>Acao</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

async function carregarReservas(filtro) {
  filtroStatusAtual = filtro;
  var wrap = document.getElementById('reservasWrap');
  wrap.innerHTML = '<div class="loader"><div class="spin"></div></div>';
  try {
    var { data, error } = await supabase.from('reservas').select('*').order('criado_em', { ascending: false });
    if (error) throw error;
    reservasCached = data || [];
    var lista = reservasCached;
    if (filtro) lista = lista.filter(function(r) { return r.status === filtro; });
    if (termoBuscaAdmin) lista = lista.filter(function(r) { return (r.nome||'').toLowerCase().includes(termoBuscaAdmin); });
    renderTabelaReservas(lista);
  } catch(e) { wrap.innerHTML = '<div class="empty">Erro ao carregar.</div>'; }
}

window.filtrarPorCliente = function(termo) {
  termoBuscaAdmin = termo.trim().toLowerCase();
  var lista = reservasCached;
  if (filtroStatusAtual) lista = lista.filter(function(r) { return r.status === filtroStatusAtual; });
  if (termoBuscaAdmin) lista = lista.filter(function(r) { return (r.nome||'').toLowerCase().includes(termoBuscaAdmin); });
  renderTabelaReservas(lista);
};

window.exportarCSV = async function() {
  try {
    var { data, error } = await supabase.from('reservas').select('*').order('criado_em', { ascending: false });
    if (error) throw error;
    var linhas = [['Codigo','Nome','WhatsApp','Produto','Preco','Qtd','Data Retirada','Status','Criado em']];
    (data || []).forEach(function(r) {
      var dt = r.criado_em ? new Date(r.criado_em).toLocaleDateString('pt-BR') : '';
      linhas.push([r.codigo||'', r.nome||'', r.tel||'', r.produto_nome||'', r.preco||'', r.quantidade||'', r.data_retirada||'', r.status||'', dt]);
    });
    var csv = linhas.map(function(l) { return l.map(function(v) { return '"' + String(v).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'reservas_multiverso.csv'; a.click();
    URL.revokeObjectURL(url);
  } catch(e) { alert('Erro ao exportar.'); }
};

window.filtrarRes = function(s, el) {
  document.querySelectorAll('.fbtn').forEach(function(b) { b.classList.remove('active'); });
  el.classList.add('active');
  carregarReservas(s);
};

window.abrirStatus = function(id, status, codigo) {
  statusReservaId = id;
  document.getElementById('sCodigo').textContent = codigo;
  document.getElementById('sSelect').value = status;
  document.getElementById('sErr').textContent = '';
  document.getElementById('statusOverlay').classList.add('open');
};
window.fecharStatus = function() { document.getElementById('statusOverlay').classList.remove('open'); };

window.confirmarStatus = async function() {
  var novoStatus = document.getElementById('sSelect').value;
  try {
    var err;
    if (novoStatus === 'cancelled') {
      var res = await supabase.rpc('cancelar_reserva', { p_reserva_id: statusReservaId });
      err = res.error;
    } else {
      var res = await supabase.from('reservas').update({ status: novoStatus }).eq('id', statusReservaId);
      err = res.error;
    }
    if (err) throw err;
    fecharStatus();
    carregarReservas(filtroStatusAtual);
  } catch(e) { document.getElementById('sErr').textContent = 'Erro ao atualizar.'; }
};

async function carregarProdutos() {
  var wrap = document.getElementById('produtosWrap');
  wrap.innerHTML = '<div class="loader"><div class="spin"></div></div>';
  try {
    var { data, error } = await supabase.from('produtos').select('*').eq('ativo', true);
    if (error) throw error;
    var lista = data || [];
    if (!lista.length) { wrap.innerHTML = '<div class="empty">Nenhum produto.</div>'; return; }
    var rows = lista.map(function(p) {
      var editData = JSON.stringify({id:p.id, nome:p.nome, descricao:p.descricao||'', categoria:p.categoria, badge:p.badge||'', preco:p.preco, estoque:p.estoque, foto:p.foto||''}).replace(/"/g, '&quot;');
      var imgHtml = p.foto
        ? '<img src="' + escHtml(p.foto) + '" style="width:38px;height:38px;object-fit:cover;vertical-align:middle;margin-right:.5rem;border:1px solid var(--border)">'
        : '<span style="font-size:1.3rem;vertical-align:middle;margin-right:.4rem">' + escHtml(p.emoji || '📦') + '</span>';
      return '<tr>' +
        '<td>' + imgHtml + '<strong>' + escHtml(p.nome) + '</strong></td>' +
        '<td style="font-size:.8rem;color:var(--muted)">' + escHtml(p.categoria) + '</td>' +
        '<td style="font-family:\'Orbitron\',monospace;color:var(--gold)">' + fmtPreco(p.preco) + '</td>' +
        '<td class="' + stockCls(p.estoque) + '" style="font-family:\'Orbitron\',monospace;font-weight:700">' + escHtml(p.estoque) + '</td>' +
        '<td>' + badgeHtml(p.badge) + '</td>' +
        '<td style="display:flex;gap:.5rem;flex-wrap:wrap">' +
        '<button class="btn btn-ghost btn-sm" onclick="abrirEdit(\'' + editData + '\')">Editar</button>' +
        '<button class="btn btn-danger btn-sm" onclick="desativar(\'' + escHtml(p.id) + '\',\'' + escHtml(p.nome) + '\')">Remover</button>' +
        '</td></tr>';
    }).join('');
    wrap.innerHTML = '<table><thead><tr><th>Produto</th><th>Categoria</th><th>Preco</th><th>Estoque</th><th>Badge</th><th>Acoes</th></tr></thead><tbody>' + rows + '</tbody></table>';
  } catch(e) { wrap.innerHTML = '<div class="empty">Erro ao carregar.</div>'; }
}

window.abrirEdit = function(p) {
  var prod = typeof p === 'string' ? JSON.parse(p) : p;
  document.getElementById('epId').value        = prod.id;
  document.getElementById('epNome').value      = prod.nome;
  document.getElementById('epDesc').value      = prod.descricao || '';
  document.getElementById('epCat').value       = prod.categoria;
  document.getElementById('epBadge').value     = prod.badge || '';
  document.getElementById('epPreco').value     = prod.preco;
  document.getElementById('epEstoque').value   = prod.estoque;
  document.getElementById('epFotoAtual').value = prod.foto || '';
  document.getElementById('epFoto').value      = '';
  var preview     = document.getElementById('epFotoPreview');
  var placeholder = document.getElementById('epFotoPlaceholder');
  if (prod.foto) {
    preview.src = prod.foto;
    preview.style.display = 'block';
    placeholder.textContent = '📷 Clique para alterar a imagem';
  } else {
    preview.style.display = 'none';
    placeholder.textContent = '📷 Clique para selecionar uma imagem';
  }
  document.getElementById('epErr').textContent = '';
  document.getElementById('editOverlay').classList.add('open');
};
window.fecharEdit = function() { document.getElementById('editOverlay').classList.remove('open'); };

window.salvarEdit = async function() {
  var id       = document.getElementById('epId').value;
  var fotoAtual = document.getElementById('epFotoAtual').value;
  var fotoFile  = document.getElementById('epFoto').files[0];
  var fotoUrl   = fotoAtual;
  document.getElementById('epErr').textContent = '';
  if (fotoFile) {
    if (fotoFile.size > MAX_FILE_SIZE) {
      document.getElementById('epErr').textContent = 'Imagem muito grande. Máximo 5 MB.';
      return;
    }
    try {
      document.getElementById('epErr').textContent = 'Processando imagem...';
      fotoUrl = await prepararFoto(fotoFile);
      document.getElementById('epErr').textContent = '';
    } catch(e) {
      document.getElementById('epErr').textContent = 'Erro ao processar imagem.';
      return;
    }
  }
  var dados = {
    nome:      document.getElementById('epNome').value,
    descricao: document.getElementById('epDesc').value,
    categoria: document.getElementById('epCat').value,
    badge:     document.getElementById('epBadge').value || null,
    preco:     parseFloat(document.getElementById('epPreco').value),
    estoque:   parseInt(document.getElementById('epEstoque').value),
    foto:      fotoUrl,
    emoji:     fotoUrl ? '' : '📦'
  };
  try {
    var { error } = await supabase.from('produtos').update(dados).eq('id', id);
    if (error) throw error;
    fecharEdit();
    carregarProdutos();
  } catch(e) { document.getElementById('epErr').textContent = 'Erro ao salvar.'; }
};

window.desativar = async function(id, nome) {
  if (!confirm('Desativar "' + nome + '"?')) return;
  await supabase.from('produtos').update({ ativo: false }).eq('id', id);
  carregarProdutos();
};

window.previewImagem = function(inputId, previewId, placeholderId) {
  var file = document.getElementById(inputId).files[0];
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    document.getElementById(placeholderId).textContent = '⚠️ Imagem muito grande. Máximo 5 MB.';
    document.getElementById(inputId).value = '';
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    var preview = document.getElementById(previewId);
    preview.src = e.target.result;
    preview.style.display = 'block';
    document.getElementById(placeholderId).textContent = '✅ ' + file.name;
  };
  reader.readAsDataURL(file);
};

function comprimirImagem(file, maxWidth, qualidade) {
  return new Promise(function(resolve) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function() {
      URL.revokeObjectURL(url);
      var w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(resolve, 'image/webp', qualidade);
    };
    img.src = url;
  });
}

async function prepararFoto(file) {
  var blob = await comprimirImagem(file, 800, 0.82);
  var ext = 'webp';
  var nome = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  var up = await supabase.storage.from('produtos').upload(nome, blob, {
    contentType: 'image/webp',
    cacheControl: '31536000'
  });
  if (up.error) throw up.error;
  var pub = supabase.storage.from('produtos').getPublicUrl(nome);
  return pub.data.publicUrl;
}

window.criarProduto = async function() {
  var nome    = document.getElementById('npNome').value.trim();
  var preco   = parseFloat(document.getElementById('npPreco').value);
  var estoque = parseInt(document.getElementById('npEstoque').value);
  document.getElementById('npErr').textContent = '';
  document.getElementById('npOk').textContent  = '';
  if (!nome || isNaN(preco) || isNaN(estoque)) {
    document.getElementById('npErr').textContent = 'Preencha nome, preco e estoque.';
    return;
  }
  var fotoFile = document.getElementById('npFoto').files[0];
  var fotoData = '';
  if (fotoFile) {
    if (fotoFile.size > MAX_FILE_SIZE) {
      document.getElementById('npErr').textContent = 'Imagem muito grande. Máximo 5 MB.';
      return;
    }
    try {
      document.getElementById('npOk').textContent = 'Processando imagem...';
      fotoData = await prepararFoto(fotoFile);
    } catch(e) {
      document.getElementById('npErr').textContent = 'Erro ao processar imagem.';
      return;
    }
  }
  try {
    var { error } = await supabase.from('produtos').insert({
      nome:      nome,
      descricao: document.getElementById('npDesc').value,
      categoria: document.getElementById('npCat').value,
      badge:     document.getElementById('npBadge').value || null,
      preco:     preco,
      estoque:   estoque,
      foto:      fotoData,
      emoji:     fotoData ? '' : '📦',
      ativo:     true
    });
    if (error) throw error;
    document.getElementById('npOk').textContent = 'Produto "' + nome + '" cadastrado!';
    document.getElementById('npNome').value    = '';
    document.getElementById('npDesc').value    = '';
    document.getElementById('npPreco').value   = '';
    document.getElementById('npEstoque').value = '1';
    document.getElementById('npFoto').value    = '';
    document.getElementById('npFotoPreview').style.display = 'none';
    document.getElementById('npFotoPlaceholder').textContent = '📷 Clique para selecionar uma imagem';
    document.getElementById('npBadge').value   = '';
  } catch(e) { document.getElementById('npErr').textContent = 'Erro ao cadastrar.'; }
};

['editOverlay', 'statusOverlay'].forEach(function(id) {
  document.getElementById(id).addEventListener('click', function(e) {
    if (e.target.id === id) document.getElementById(id).classList.remove('open');
  });
});
