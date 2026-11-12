// Estrutura comum: menu de relatórios, usuário, helpers de formatação e de API.
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

  function registrar(r) { relatorios.push(r); }

  let visiveis = [];

  function abrir(id) {
    const main = document.getElementById('conteudo');
    const r = visiveis.find((x) => x.id === id) || visiveis[0];
    if (!r) { main.innerHTML = '<div class="card vazio">Você ainda não tem acesso a nenhum relatório. Peça ao administrador para liberar.</div>'; return; }
    document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('ativo', a.dataset.id === r.id));
    document.querySelector('.topo').classList.remove('aberto');
    graficos.forEach((g) => g.destroy()); graficos.clear();
    main.innerHTML = '';
    r.render(main);
  }

  async function iniciar() {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = cor('--muted');
    const me = await api('/api/me');
    document.getElementById('usuario').innerHTML = esc(me.usuario.nome) + (me.demo ? ' <span class="demo-tag">DEMO</span>' : '');
    document.getElementById('sair').onclick = async () => { await fetch('/api/logout', { method: 'POST' }); location.href = '/login.html'; };
    visiveis = relatorios.filter((r) => (r.admin ? me.admin : (me.permitidos || []).includes(r.id)));
    document.getElementById('menu').innerHTML = visiveis.map((r) => `<a href="#${r.id}" data-id="${r.id}">${esc(r.titulo)}</a>`).join('');
    document.getElementById('hamb').onclick = () => document.querySelector('.topo').classList.toggle('aberto');
    window.addEventListener('hashchange', () => abrir(location.hash.slice(1)));
    abrir(location.hash.slice(1));
  }

  return { registrar, iniciar, api, fmt, esc, grafico, cor, aderenciaPill, difClasse };
})();
