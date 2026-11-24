// Estrutura comum: menu lateral dinâmico, usuário, helpers de formatação e de API.
window.BI = (() => {
  const relatorios = [];
  const graficos = new Map();

  const nf = (d = 0) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = {
    n: (v, d = 0) => (v === null || v === undefined || isNaN(v) ? '–' : nf(d).format(v)),
    pct: (v, d = 1) => (v === null || v === undefined ? '–' : nf(d).format(v) + '%'),
    pp: (v, d = 1) => (v === null || v === undefined ? '–' : (v > 0 ? '+' : '') + nf(d).format(v) + ' p.p.'),
    data: (v) => (v ? v.split('-').reverse().join('/') : '–'),
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (r.status === 401) { location.href = '/login.html'; throw new Error('Sessão expirada'); }
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || 'Erro');
    // empresas (IDEmpresa) dos dados do relatório -> cabeçalho do PDF
    if (j && Array.isArray(j.empresas)) window.dispatchEvent(new CustomEvent('bi:empresas', { detail: j.empresas }));
    return j;
  }

  function cor(nome) { return getComputedStyle(document.documentElement).getPropertyValue(nome).trim(); }

  // Cria/atualiza um gráfico Chart.js num <canvas id="...">
  function grafico(id, config) {
    if (graficos.has(id)) graficos.get(id).destroy();
    const el = document.getElementById(id);
    if (!el) return null;
    config.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 250 } }, config.options || {});
    const g = new Chart(el, config);
    graficos.set(id, g);
    return g;
  }

  function aderenciaPill(v) {
    if (v === null || v === undefined) return '<span class="pill">–</span>';
    const c = v >= 90 ? 'bom' : v >= 75 ? 'medio' : 'ruim';
    return `<span class="pill ${c}">${fmt.pct(v)}</span>`;
  }
  function difClasse(v, lim = 0.05) { return v > lim ? 'pos' : v < -lim ? 'neg' : ''; }

  // ---------- Bebida: comparação entre dois lados (amostra × lotes, comprado × vendido) ----------
  // linhas: [{ bebida, pctA, pctB, diferenca, sacasA, sacasB }]
  function tabelaBebida(linhas, rotA, rotB, { sacasA = 'Sacas esperadas*', sacasB = 'Sacas ' + rotB.toLowerCase(), saldo = 'Dif. sacas', saldoAB = false } = {}) {
    if (!linhas || !linhas.length) return '<div class="card vazio" style="box-shadow:none">Sem bebida cadastrada nos lotes/amostras desse filtro.</div>';
    const tA = linhas.reduce((s, l) => s + (l.sacasA || 0), 0), tB = linhas.reduce((s, l) => s + (l.sacasB || 0), 0);
    const dif = (l) => (saldoAB ? l.sacasA - l.sacasB : l.sacasB - l.sacasA);
    return `<div class="tabela"><table><thead><tr><th class="esq">Bebida</th><th>${esc(rotA)}</th><th>${esc(rotB)}</th><th>Diferença</th><th>${esc(sacasA)}</th><th>${esc(sacasB)}</th><th>${esc(saldo)}</th></tr></thead>
      <tbody>${linhas.map((l) => `<tr><td class="esq">${esc(l.bebida)}</td><td>${fmt.pct(l.pctA)}</td><td>${fmt.pct(l.pctB)}</td><td class="${difClasse(l.diferenca)}">${fmt.pp(l.diferenca)}</td>
        <td>${fmt.n(l.sacasA, 1)}</td><td>${fmt.n(l.sacasB, 1)}</td><td class="${difClasse(dif(l), 0.5)}">${fmt.n(dif(l), 1)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th class="esq">Total</th><th></th><th></th><th></th><th>${fmt.n(tA, 1)}</th><th>${fmt.n(tB, 1)}</th><th>${fmt.n(saldoAB ? tA - tB : tB - tA, 1)}</th></tr></tfoot></table></div>`;
  }
  function graficoBebida(id, linhas, rotA, rotB) {
    if (!linhas || !linhas.length) return null;
    return grafico(id, {
      type: 'bar',
      data: { labels: linhas.map((l) => l.bebida), datasets: [
        { label: rotA, data: linhas.map((l) => l.pctA), backgroundColor: cor('--amostra'), borderRadius: 4, maxBarThickness: 34 },
        { label: rotB, data: linhas.map((l) => l.pctB), backgroundColor: cor('--entrada'), borderRadius: 4, maxBarThickness: 34 },
      ] },
      options: { interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.pct(c.parsed.y)}`, afterBody: (it) => 'Diferença: ' + fmt.pp(linhas[it[0].dataIndex].diferenca) } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + '%' }, grid: { color: cor('--line') } }, x: { grid: { display: false } } } },
    });
  }
  // bebida do lote: vermelho quando não bate com a bebida da amostra
  function bebidaLote(l) {
    if (!l.bebida) return '–';
    if (l.bebidaConfere === false) return `<span class="pill ruim" title="Bebida diferente da amostra">${esc(l.bebida)}</span>`;
    return esc(l.bebida);
  }

  function registrar(r) { relatorios.push(r); }

  // ---------- Menu lateral dinâmico ----------
  // O servidor manda o menu (grupos/ícones) já filtrado pelas permissões do usuário;
  // só entram itens que têm tela registrada (rel-*.js).
  let visiveis = [];     // [{ id, titulo, icone, grupo, render }]
  let grupos = [];       // [{ grupo, itens }]
  const LS = { recolhido: 'bi-menu-recolhido', fechados: 'bi-menu-grupos-fechados' };
  const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch (_) { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const mobile = () => window.matchMedia('(max-width: 860px)').matches;

  function montarMenu(me) {
    const porId = new Map(relatorios.map((r) => [r.id, r]));
    const origem = Array.isArray(me.menu) && me.menu.length
      ? me.menu
      // servidor antigo (sem "menu"): monta a partir do que foi registrado
      : [{ grupo: 'Relatórios', itens: relatorios.filter((r) => (r.admin ? me.admin : (me.permitidos || []).includes(r.id))) }];
    grupos = origem.map((g) => ({
      grupo: g.grupo,
      itens: g.itens.filter((i) => porId.has(i.id)).map((i) => ({
        ...porId.get(i.id), id: i.id, titulo: i.titulo || porId.get(i.id).titulo, icone: i.icone || porId.get(i.id).icone || '📊', grupo: g.grupo,
      })),
    })).filter((g) => g.itens.length);
    visiveis = grupos.flatMap((g) => g.itens);
    desenharMenu();
  }

  function desenharMenu() {
    const nav = document.getElementById('menu');
    const termo = (document.getElementById('menu-busca').value || '').trim().toLowerCase();
    const fechados = ler(LS.fechados, []);
    const atual = location.hash.slice(1) || (visiveis[0] && visiveis[0].id);
    const html = grupos.map((g) => {
      const itens = g.itens.filter((i) => !termo || i.titulo.toLowerCase().includes(termo) || g.grupo.toLowerCase().includes(termo));
      if (!itens.length) return '';
      const fechado = !termo && fechados.includes(g.grupo) && !itens.some((i) => i.id === atual);
      return `<div class="m-grupo${fechado ? ' fechado' : ''}" data-grupo="${esc(g.grupo)}">
        <button type="button" class="m-grupo-tit" aria-expanded="${!fechado}"><span class="rot">${esc(g.grupo)}</span><span class="seta">▾</span></button>
        <div class="m-itens">${itens.map((i) => `<a href="#${esc(i.id)}" data-id="${esc(i.id)}" title="${esc(i.titulo)}"${i.id === atual ? ' class="ativo" aria-current="page"' : ''}>
          <span class="ic">${esc(i.icone)}</span><span class="rot">${esc(i.titulo)}</span></a>`).join('')}</div></div>`;
    }).join('');
    nav.innerHTML = html || `<div class="m-vazio">${termo ? 'Nenhum relatório encontrado.' : 'Nenhum relatório liberado.'}</div>`;
    nav.querySelectorAll('.m-grupo-tit').forEach((b) => b.onclick = () => {
      const g = b.parentElement, nome = g.dataset.grupo;
      if (document.body.classList.contains('menu-recolhido') && !mobile()) return;
      g.classList.toggle('fechado');
      b.setAttribute('aria-expanded', !g.classList.contains('fechado'));
      const set = new Set(ler(LS.fechados, []));
      g.classList.contains('fechado') ? set.add(nome) : set.delete(nome);
      gravar(LS.fechados, [...set]);
    });
  }

  function abrirMenuMobile(abrir) { document.body.classList.toggle('menu-aberto', abrir); }

  function recolher(sim) {
    document.body.classList.toggle('menu-recolhido', sim);
    const b = document.getElementById('recolher');
    b.textContent = sim ? '»' : '«';
    b.title = sim ? 'Expandir menu' : 'Recolher menu';
    gravar(LS.recolhido, sim);
  }

  function abrir(id) {
    const main = document.getElementById('conteudo');
    const r = visiveis.find((x) => x.id === id) || visiveis[0];
    abrirMenuMobile(false);
    if (!r) {
      document.getElementById('titulo-pagina').textContent = '';
      main.innerHTML = '<div class="card vazio">Você ainda não tem acesso a nenhum relatório. Peça ao administrador para liberar.</div>';
      return;
    }
    document.getElementById('titulo-grupo').textContent = r.grupo || '';
    document.getElementById('titulo-pagina').textContent = r.titulo;
    document.title = r.titulo + ' · BI Itah';
    desenharMenu();
    graficos.forEach((g) => g.destroy()); graficos.clear();
    window.dispatchEvent(new CustomEvent('bi:empresas', { detail: null })); // relatório novo: volta à empresa padrão
    main.innerHTML = '';
    r.render(main);
  }

  async function iniciar() {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = cor('--muted');
    recolher(!!ler(LS.recolhido, false));
    const me = await api('/api/me');
    const nome = me.usuario.nome || me.usuario.login || '';
    document.getElementById('usuario').innerHTML = esc(nome) + (me.demo ? ' <span class="demo-tag">DEMO</span>' : '');
    document.getElementById('avatar').textContent = (nome.trim()[0] || '?').toUpperCase();
    document.getElementById('avatar').title = nome;
    document.getElementById('sair').onclick = async () => { await fetch('/api/logout', { method: 'POST' }); location.href = '/login.html'; };
    document.getElementById('hamb').onclick = () => abrirMenuMobile(true);
    document.getElementById('fundo-menu').onclick = () => abrirMenuMobile(false);
    document.getElementById('recolher').onclick = () => (mobile() ? abrirMenuMobile(false) : recolher(!document.body.classList.contains('menu-recolhido')));
    const busca = document.getElementById('menu-busca');
    busca.oninput = desenharMenu;
    busca.onkeydown = (e) => {
      if (e.key === 'Enter') { const a = document.querySelector('#menu a'); if (a) location.hash = a.dataset.id; busca.value = ''; desenharMenu(); }
      if (e.key === 'Escape') { busca.value = ''; desenharMenu(); }
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrirMenuMobile(false); });
    montarMenu(me);
    window.addEventListener('hashchange', () => abrir(location.hash.slice(1)));
    abrir(location.hash.slice(1));
  }

  const graficosAtivos = () => [...graficos.entries()];

  return { registrar, iniciar, graficosAtivos, api, fmt, esc, grafico, cor, aderenciaPill, difClasse, tabelaBebida, graficoBebida, bebidaLote };
})();
