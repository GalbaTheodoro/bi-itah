// Relatório: Estoque (dbo.VW_estoque) por padrão, tipo, bebida, cliente, armazém e status
(() => {
  const { api, fmt, esc, grafico, cor } = BI;
  const DIMS = [
    { k: 'status', nome: 'Status', plural: 'status' },
    { k: 'padrao', nome: 'Padrão', plural: 'padrões' },
    { k: 'tipo', nome: 'Tipo de produto', plural: 'tipos' },
    { k: 'bebida', nome: 'Bebida', plural: 'bebidas' },
    { k: 'cliente', nome: 'Cliente (depositante)', plural: 'clientes' },
    { k: 'armazem', nome: 'Armazém de depósito', plural: 'armazéns' },
    { k: 'tipoDom', nome: 'Próprio / Terceiro', plural: 'tipos' },
  ];
  const CAMPO = { status: 'porStatus', padrao: 'porPadrao', tipo: 'porTipo', bebida: 'porBebida', cliente: 'porCliente', armazem: 'porArmazem', tipoDom: 'porDom' };
  const MAX_BARRAS = 15;
  const PAGINA = 200;
  const PALETA = ['#2f7fe0', '#e08a1e', '#1f8a55', '#c9423a', '#7b5cc4', '#1aa3a3', '#b8860b', '#d4589a', '#5b6b82', '#8fb339'];
  const estado = { filtros: {}, cruzar: { linhas: 'tipo', colunas: 'bebida' }, resumo: 'cliente', busca: '', limite: PAGINA, dados: null };
  const nomeDim = (k) => DIMS.find((d) => d.k === k)?.nome || k;
  const sc = (v, d = 0) => fmt.n(v, d) + ' sc';

  async function carregar(atualizar = false) {
    const area = document.getElementById('es-area');
    area.classList.add('carregando');
    try {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(estado.filtros)) if (v) p.set(k, v);
      p.set('linhas', estado.cruzar.linhas); p.set('colunas', estado.cruzar.colunas);
      if (atualizar) p.set('atualizar', '1');
      estado.dados = await api('/api/estoque?' + p.toString());
      estado.limite = PAGINA;
      document.getElementById('es-atualizado').textContent = 'Dados de ' + new Date(estado.dados.atualizadoEm).toLocaleString('pt-BR')
        + (estado.dados.msBanco ? ` · consulta ao banco: ${fmt.n(estado.dados.msBanco / 1000, 1)} s` : '');
      preencherFiltros();
      desenhar();
    } catch (e) { area.innerHTML = `<div class="aviso">${esc(e.message)}</div>`; } finally { area.classList.remove('carregando'); }
  }

  function preencherFiltros() {
    const form = document.getElementById('es-filtros');
    for (const d of DIMS) {
      const sel = form[d.k];
      const atual = estado.filtros[d.k] || '';
      sel.innerHTML = `<option value="">Todos</option>` + (estado.dados.opcoes[d.k] || []).map((o) => `<option ${o === atual ? 'selected' : ''}>${esc(o)}</option>`).join('');
    }
  }

  function filtrar(k, v) {
    if (estado.filtros[k] === v) delete estado.filtros[k]; else estado.filtros[k] = v;
    carregar();
  }

  // ---------- Gráficos ----------
  function gBarras(id, k, itens) {
    const mostrar = itens.slice(0, MAX_BARRAS);
    const sel = estado.filtros[k];
    grafico(id, {
      type: 'bar',
      data: { labels: mostrar.map((x) => x.nome), datasets: [{ data: mostrar.map((x) => x.sacas),
        backgroundColor: mostrar.map((x) => (sel && x.nome !== sel ? cor('--line') : cor('--amostra'))), borderRadius: 4, maxBarThickness: 26 }] },
      options: {
        indexAxis: 'y',
        onClick: (ev, els) => { if (els.length) filtrar(k, mostrar[els[0].index].nome); },
        onHover: (ev, els) => { ev.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          label: (c) => { const x = mostrar[c.dataIndex]; return [`${sc(x.sacas)} (${fmt.pct(x.pct)})`, `${fmt.n(x.peso)} kg · ${fmt.n(x.lotes)} lotes`]; } } } },
        scales: { x: { beginAtZero: true, ticks: { callback: (v) => fmt.n(v) }, grid: { color: cor('--line') } },
          y: { grid: { display: false }, ticks: { callback: function (v) { const t = this.getLabelForValue(v); return t.length > 28 ? t.slice(0, 27) + '…' : t; } } } },
      },
    });
  }

  function gRosca(id, k, itens) {
    const sel = estado.filtros[k];
    grafico(id, {
      type: 'doughnut',
      data: { labels: itens.map((x) => x.nome), datasets: [{ data: itens.map((x) => x.sacas),
        backgroundColor: itens.map((x, i) => (sel && x.nome !== sel ? cor('--line') : PALETA[i % PALETA.length])), borderWidth: 2 }] },
      options: {
        cutout: '58%',
        onClick: (ev, els) => { if (els.length) filtrar(k, itens[els[0].index].nome); },
        onHover: (ev, els) => { ev.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, boxHeight: 12 } }, tooltip: { callbacks: {
          label: (c) => { const x = itens[c.dataIndex]; return `${x.nome}: ${sc(x.sacas)} (${fmt.pct(x.pct)}) · ${fmt.n(x.lotes)} lotes`; } } } },
      },
    });
  }

  // ---------- Pedaços da tela ----------
  function chips() {
    const ativos = Object.entries(estado.filtros).filter(([, v]) => v);
    if (!ativos.length) return '<p class="sub">Toque numa barra ou fatia para filtrar o estoque por ela.</p>';
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${ativos.map(([k, v]) =>
      `<button type="button" class="btn sec" data-tira="${esc(k)}" style="padding:4px 10px">${esc(nomeDim(k))}: <b>${esc(v)}</b> ✕</button>`).join('')}
      <button type="button" class="btn sec" id="es-limpar" style="padding:4px 10px">Limpar filtros</button></div>`;
  }

  function cardGrafico(id, k, itens, titulo, tipo = 'barra', classe = '') {
    const mais = itens.length > MAX_BARRAS && tipo === 'barra' ? ` · mostrando os ${MAX_BARRAS} maiores de ${itens.length}` : '';
    const alto = tipo === 'barra' && Math.min(itens.length, MAX_BARRAS) > 8;
    return `<div class="card ${classe}"><h2>${titulo}</h2><p class="sub">Sacas em estoque${mais}</p>
      ${itens.length ? `<div class="grafico ${alto ? 'alto' : ''}"><canvas id="${id}"></canvas></div>` : '<div class="vazio">Sem dados.</div>'}</div>`;
  }

  function tabelaResumo(d) {
    const k = estado.resumo, itens = d[CAMPO[k]] || [];
    const tot = itens.reduce((a, x) => ({ s: a.s + x.sacas, p: a.p + x.peso }), { s: 0, p: 0 });
    return `<div class="card full"><h2>Resumo por <select id="es-resumo" class="busca" style="width:auto;display:inline-block;margin:0 0 0 4px;padding:4px 8px">${DIMS.map((x) => `<option value="${x.k}" ${x.k === k ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></h2>
      <p class="sub">Toque numa linha para filtrar</p>
      <div class="tabela lista-contratos"><table><thead><tr><th class="esq">${esc(nomeDim(k))}</th><th>Sacas</th><th>% do estoque</th><th>Peso líquido (kg)</th><th>Lotes</th></tr></thead>
      <tbody>${itens.map((x) => `<tr class="click ${estado.filtros[k] === x.nome ? 'sel' : ''}" data-dim="${k}" data-valor="${esc(x.nome)}"><td class="esq">${esc(x.nome)}</td><td>${fmt.n(x.sacas, 1)}</td><td>${fmt.pct(x.pct)}</td><td>${fmt.n(x.peso)}</td><td>${fmt.n(x.lotes)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th class="esq">Total</th><th>${fmt.n(tot.s, 1)}</th><th>100%</th><th>${fmt.n(tot.p)}</th><th></th></tr></tfoot></table></div></div>`;
  }

  function tabelaCruzada(d) {
    const c = d.cruzado;
    const opt = (sel) => DIMS.map((x) => `<option value="${x.k}" ${x.k === sel ? 'selected' : ''}>${esc(x.nome)}</option>`).join('');
    const totCol = {};
    for (const l of c.linhas) for (const [k, v] of Object.entries(l.v)) totCol[k] = (totCol[k] || 0) + v;
    const totGeral = c.linhas.reduce((s, l) => s + l.total, 0);
    return `<div class="card full"><h2>Cruzamento (sacas)</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px" class="sub">
        Linhas <select id="es-cz-lin" class="busca" style="width:auto;margin:0;padding:4px 8px">${opt(c.dimLinhas)}</select>
        × Colunas <select id="es-cz-col" class="busca" style="width:auto;margin:0;padding:4px 8px">${opt(c.dimColunas)}</select></div>
      <div class="tabela lista-contratos"><table><thead><tr><th class="esq">${esc(nomeDim(c.dimLinhas))} × ${esc(nomeDim(c.dimColunas))}</th>${c.colunas.map((x) => `<th>${esc(x)}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>${c.linhas.map((l) => `<tr><td class="esq">${esc(l.nome)}</td>${c.colunas.map((x) => `<td>${l.v[x] ? fmt.n(l.v[x], 1) : '–'}</td>`).join('')}<td><b>${fmt.n(l.total, 1)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><th class="esq">Total</th>${c.colunas.map((x) => `<th>${fmt.n(totCol[x] || 0, 1)}</th>`).join('')}<th>${fmt.n(totGeral, 1)}</th></tr></tfoot></table></div>
      ${c.colunas.includes('Outros') ? '<div class="legenda-calc">Outros = colunas menores somadas (mostrando as 12 maiores).</div>' : ''}</div>`;
  }

  function lotesFiltrados() {
    const b = estado.busca.toLowerCase();
    return estado.dados.lotes.filter((l) => !b || [l.lote, l.cliente, l.armazem, l.tipo, l.padrao, l.bebida, l.status].join(' ').toLowerCase().includes(b));
  }
  function linhasLotes() {
    const lista = lotesFiltrados(), mostrar = lista.slice(0, estado.limite), resto = lista.length - mostrar.length;
    return mostrar.map((l) => `<tr><td>${esc(l.lote)}</td><td>${fmt.data(l.data)}</td><td class="esq">${esc(l.cliente || '–')}</td><td>${esc(l.tipoDom || '–')}</td><td class="esq">${esc(l.armazem || '–')}</td>
        <td>${esc(l.status || '–')}</td><td class="esq">${esc(l.tipo || '–')}</td><td class="esq">${esc(l.padrao || '–')}</td><td class="esq">${esc(l.bebida || '–')}</td>
        <td>${fmt.n(l.sacas, 1)}</td><td>${fmt.n(l.peso)}</td></tr>`).join('')
      + (resto > 0 ? `<tr class="mais"><td colspan="11"><button type="button" class="btn sec" id="es-mais">Mostrar mais ${fmt.n(Math.min(resto, PAGINA))} de ${fmt.n(resto)} restantes</button></td></tr>` : '')
      + (!lista.length ? '<tr><td colspan="11" class="vazio">Nenhum lote encontrado.</td></tr>' : '');
  }
  function ligarLotes() {
    const mais = document.getElementById('es-mais');
    if (mais) mais.onclick = () => { estado.limite += PAGINA; document.getElementById('es-corpo').innerHTML = linhasLotes(); ligarLotes(); };
  }

  function desenhar() {
    const d = estado.dados, k = d.kpis, area = document.getElementById('es-area');
    area.innerHTML = `
      ${chips()}
      <div class="kpis">
        <div class="kpi"><div class="t">Estoque</div><div class="v">${fmt.n(k.sacas)}</div><div class="d">sacas · ${fmt.n(k.peso)} kg líquidos</div></div>
        <div class="kpi"><div class="t">Lotes</div><div class="v">${fmt.n(k.lotes)}</div><div class="d">${fmt.n(k.clientes)} clientes · ${fmt.n(k.armazens)} armazéns</div></div>
        <div class="kpi"><div class="t">Disponível</div><div class="v">${fmt.n(k.disponivel)}</div><div class="d">${k.sacas ? fmt.pct((k.disponivel / k.sacas) * 100) : '–'} do estoque</div></div>
        <div class="kpi"><div class="t">Warrant</div><div class="v">${fmt.n(k.warrant)}</div><div class="d">${k.sacas ? fmt.pct((k.warrant / k.sacas) * 100) : '–'} do estoque</div></div>
        <div class="kpi"><div class="t">Em movimento</div><div class="v">${fmt.n(k.emMovimento)}</div><div class="d">em serviço, a transferir ou a sair</div></div>
        <div class="kpi"><div class="t">Próprio / Terceiro</div><div class="v">${fmt.n(k.proprio)} / ${fmt.n(k.terceiro)}</div><div class="d">sacas</div></div>
      </div>
      <div class="grade">
        ${cardGrafico('es-g-status', 'status', d.porStatus, 'Por status', 'rosca')}
        ${cardGrafico('es-g-dom', 'tipoDom', d.porDom, 'Próprio × Terceiro', 'rosca')}
        ${cardGrafico('es-g-padrao', 'padrao', d.porPadrao, 'Por padrão')}
        ${cardGrafico('es-g-tipo', 'tipo', d.porTipo, 'Por tipo de produto')}
        ${cardGrafico('es-g-bebida', 'bebida', d.porBebida, 'Por bebida')}
        ${cardGrafico('es-g-armazem', 'armazem', d.porArmazem, 'Por armazém de depósito')}
        ${cardGrafico('es-g-cliente', 'cliente', d.porCliente, 'Por cliente (depositante)', 'barra', 'full')}
        ${tabelaResumo(d)}
        ${tabelaCruzada(d)}
        <div class="card full"><h2>Lotes em estoque</h2><p class="sub">${fmt.n(d.lotes.length)} linhas (lote × status × armazém) · maiores primeiro</p>
          <input class="busca" id="es-busca" placeholder="Buscar lote, cliente, armazém, tipo, padrão, bebida ou status" value="${esc(estado.busca)}">
          <div class="tabela lista-contratos"><table><thead><tr><th>Lote</th><th>Data</th><th class="esq">Cliente</th><th>Próprio/Terc.</th><th class="esq">Armazém</th><th>Status</th><th class="esq">Tipo</th><th class="esq">Padrão</th><th class="esq">Bebida</th><th>Sacas</th><th>Peso líq. (kg)</th></tr></thead>
          <tbody id="es-corpo">${linhasLotes()}</tbody></table></div></div>
      </div>
      <div class="legenda-calc">Fonte: view dbo.VW_estoque. Disponível/Warrant = saldo nas posições do armazém; Em serviço = em guia de serviço aberta; A transferir = em transferência aberta; A sair = em guia de saída aberta. Sacas = volume; peso = peso líquido.</div>`;

    const gs = [['es-g-padrao', 'padrao'], ['es-g-tipo', 'tipo'], ['es-g-bebida', 'bebida'], ['es-g-armazem', 'armazem'], ['es-g-cliente', 'cliente']];
    for (const [id, dim] of gs) if (d[CAMPO[dim]].length) gBarras(id, dim, d[CAMPO[dim]]);
    if (d.porStatus.length) gRosca('es-g-status', 'status', d.porStatus);
    if (d.porDom.length) gRosca('es-g-dom', 'tipoDom', d.porDom);

    area.querySelectorAll('[data-tira]').forEach((b) => b.onclick = () => { delete estado.filtros[b.dataset.tira]; carregar(); });
    const limpar = document.getElementById('es-limpar');
    if (limpar) limpar.onclick = () => { estado.filtros = {}; carregar(); };
    document.getElementById('es-resumo').onchange = (e) => { estado.resumo = e.target.value; desenhar(); };
    area.querySelectorAll('tr[data-dim]').forEach((tr) => tr.onclick = () => filtrar(tr.dataset.dim, tr.dataset.valor));
    document.getElementById('es-cz-lin').onchange = (e) => { estado.cruzar.linhas = e.target.value; carregar(); };
    document.getElementById('es-cz-col').onchange = (e) => { estado.cruzar.colunas = e.target.value; carregar(); };
    const bx = document.getElementById('es-busca');
    let t = null;
    bx.oninput = () => { clearTimeout(t); t = setTimeout(() => { estado.busca = bx.value; estado.limite = PAGINA; document.getElementById('es-corpo').innerHTML = linhasLotes(); ligarLotes(); }, 150); };
    ligarLotes();
  }

  async function render(main) {
    main.innerHTML = `
      <h1>Estoque</h1>
      <p class="sub" id="es-atualizado">Carregando...</p>
      <form class="filtros" id="es-filtros">
        ${DIMS.map((d) => `<label>${esc(d.nome)}<select name="${d.k}"><option value="">Todos</option></select></label>`).join('')}
        <div style="display:flex;gap:6px"><button class="btn" type="submit">Aplicar</button><button class="btn sec" type="button" id="es-atualizar" title="Buscar dados novos no banco">↻</button></div>
      </form>
      <div id="es-area"></div>`;
    const form = document.getElementById('es-filtros');
    form.onsubmit = (ev) => {
      ev.preventDefault();
      estado.filtros = {};
      for (const d of DIMS) if (form[d.k].value) estado.filtros[d.k] = form[d.k].value;
      carregar();
    };
    document.getElementById('es-atualizar').onclick = () => carregar(true);
    await carregar();
  }

  BI.registrar({ id: 'estoque', titulo: 'Estoque', render });
})();
