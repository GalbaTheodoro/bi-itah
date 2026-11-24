// Relatório: Amostra vendida (contrato da guia de embarque) × Lotes embarcados
(() => {
  const { api, fmt, esc, grafico, cor, aderenciaPill, difClasse, tabelaBebida, graficoBebida, bebidaLote } = BI;
  const estado = { filtros: {}, chave: null, busca: '', dados: null, detalhes: new Map(), limite: 200 };
  const PAGINA = 200; // linhas da lista por vez (lista enorme deixa a tela lenta)
  const chaveDet = (k) => k + '|' + JSON.stringify(estado.filtros);

  // detalhe de um embarque: busca no servidor só quando abre e guarda para não buscar de novo
  async function buscarDetalhe(chave) {
    const ck = chaveDet(chave);
    if (estado.detalhes.has(ck)) return;
    estado.detalhes.set(ck, null); // marcando "carregando"
    try {
      const p = new URLSearchParams({ chave });
      for (const [k, v] of Object.entries(estado.filtros)) if (v) p.set(k, v);
      estado.detalhes.set(ck, await BI.api('/api/embarque/detalhe?' + p.toString()));
    } catch (e) {
      estado.detalhes.set(ck, { erro: e.message });
    }
    if (estado.chave === chave && document.getElementById('em-area')) desenhar();
  }
  const n = (v, d = 1) => (v === null || v === undefined ? '–' : fmt.n(v, d));

  async function carregar(atualizar = false) {
    const area = document.getElementById('em-area');
    area.classList.add('carregando');
    try {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(estado.filtros)) if (v) p.set(k, v);
      if (atualizar) p.set('atualizar', '1');
      estado.dados = await api('/api/embarque?' + p.toString());
      estado.detalhes.clear(); estado.limite = PAGINA;
      document.getElementById('em-atualizado').textContent = 'Dados de ' + new Date(estado.dados.atualizadoEm).toLocaleString('pt-BR') + (estado.dados.msBanco ? ` · consulta ao banco: ${fmt.n(estado.dados.msBanco / 1000, 1)} s` : '');
      const sel = document.querySelector('#em-filtros [name=cliente]');
      if (sel.options.length === 1) sel.innerHTML += estado.dados.clientes.map((c) => `<option>${esc(c)}</option>`).join('');
      const dl = document.getElementById('em-contratos');
      if (!dl.options.length) dl.innerHTML = (estado.dados.contratos || []).map((c) => `<option value="${esc(c)}">`).join('');
      if (!estado.chave && estado.dados.consolidados && estado.dados.consolidados.length) estado.chave = estado.dados.consolidados[0];
      desenhar();
    } catch (e) { area.innerHTML = `<div class="aviso">${esc(e.message)}</div>`; } finally { area.classList.remove('carregando'); }
  }

  function gComp(id, linhas, chave) {
    grafico(id, {
      type: 'bar',
      data: { labels: linhas.map((l) => l[chave]), datasets: [
        { label: 'Amostra vendida', data: linhas.map((l) => l.amostra), backgroundColor: cor('--amostra'), borderRadius: 4, maxBarThickness: 34 },
        { label: 'Lotes embarcados', data: linhas.map((l) => l.lotes), backgroundColor: cor('--entrada'), borderRadius: 4, maxBarThickness: 34 },
      ] },
      options: { interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.pct(c.parsed.y)}` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + '%' }, grid: { color: cor('--line') } }, x: { grid: { display: false } } } },
    });
  }

  function gGuias(id, guias) {
    grafico(id, {
      type: 'bar',
      data: { labels: guias.map((g) => g.guia), datasets: [
        { label: 'Aderência peneira', data: guias.map((g) => g.aderenciaPeneira), backgroundColor: cor('--amostra'), borderRadius: 4, maxBarThickness: 34 },
        { label: 'Aderência tipo', data: guias.map((g) => g.aderenciaTipo), backgroundColor: cor('--entrada'), borderRadius: 4, maxBarThickness: 34 },
        { label: 'Aderência bebida', data: guias.map((g) => g.aderenciaBebida), backgroundColor: cor('--pos'), borderRadius: 4, maxBarThickness: 34 },
      ] },
      options: { interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.pct(c.parsed.y)}` } } },
        scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%' }, grid: { color: cor('--line') } }, x: { grid: { display: false } } } },
    });
  }

  const periodo = (e) => (e.consolidado ? (e.dataIni === e.dataFim ? fmt.data(e.dataIni) : `${fmt.data(e.dataIni)} a ${fmt.data(e.dataFim)}`) : fmt.data(e.data));

  function tabela(linhas, nome, chave) {
    return `<div class="tabela"><table><thead><tr><th>${nome}</th><th>Amostra</th><th>Lotes</th><th>Diferença</th></tr></thead>
      <tbody>${linhas.map((l) => `<tr><td>${esc(l[chave])}</td><td>${fmt.pct(l.amostra)}</td><td>${fmt.pct(l.lotes)}</td><td class="${difClasse(l.diferenca)}">${fmt.pp(l.diferenca)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function filtrada() {
    const b = estado.busca.toLowerCase();
    return estado.dados.embarques.filter((e) => e.consolidado || !b || [e.guia, e.contrato, e.cliente, e.amostras, e.tipos, e.bebidasLotes].join(' ').toLowerCase().includes(b));
  }
  function linhasLista() {
    const lista = filtrada(), mostrar = lista.slice(0, estado.limite);
    const resto = lista.length - mostrar.length;
    return mostrar.map((e) => `<tr class="click ${e.consolidado ? 'consol' : ''} ${e.chave === estado.chave ? 'sel' : ''}" data-chave="${esc(e.chave)}"><td>${e.consolidado ? '<b>Σ Todas</b> (' + esc(e.guia) + ')' : esc(e.guia)}</td><td>${periodo(e)}</td><td>${esc(e.contrato)}</td>
            <td class="esq">${esc(e.cliente)}</td><td class="esq">${esc(e.amostras || 'sem amostra')}</td><td>${fmt.n(e.sacas, 1)}</td>
            <td>${aderenciaPill(e.aderenciaPeneira)}</td><td>${aderenciaPill(e.aderenciaTipo)}</td><td title="${esc(e.bebidasLotes || '')}">${aderenciaPill(e.aderenciaBebida)}</td><td>${n(e.defeitoAmostra)}</td>
            <td class="${e.difDefeito > 0 ? 'neg' : e.difDefeito < 0 ? 'pos' : ''}">${n(e.defeitoLotes)}</td></tr>`).join('')
      + (resto > 0 ? `<tr class="mais"><td colspan="11"><button type="button" class="btn sec" id="em-mais">Mostrar mais ${fmt.n(Math.min(resto, PAGINA))} de ${fmt.n(resto)} restantes</button></td></tr>` : '')
      + (!lista.length ? '<tr><td colspan="11" class="vazio">Nenhum embarque encontrado.</td></tr>' : '');
  }
  function ligarLista() {
    const corpo = document.getElementById('em-corpo');
    corpo.querySelectorAll('tr[data-chave]').forEach((tr) => tr.onclick = () => abrirEmbarque(tr.dataset.chave));
    const mais = document.getElementById('em-mais');
    if (mais) mais.onclick = () => { estado.limite += PAGINA; corpo.innerHTML = linhasLista(); ligarLista(); };
  }
  function abrirEmbarque(chave) {
    estado.chave = chave; desenhar();
    if (window.innerWidth < 860) document.getElementById('em-det')?.scrollIntoView({ behavior: 'smooth' });
  }

  function desenhar() {
    const d = estado.dados, k = d.kpis, area = document.getElementById('em-area');
    const b = estado.busca.toLowerCase();
    const resumo = d.embarques.find((e) => e.chave === estado.chave);
    const detDados = resumo ? estado.detalhes.get(chaveDet(estado.chave)) : undefined;
    const det = resumo && detDados && !detDados.erro ? { ...resumo, ...detDados } : null;
    if (resumo && detDados === undefined) buscarDetalhe(estado.chave);
    const pens = det ? det.peneiras.map((p) => p.peneira) : [];
    area.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="t">Embarques</div><div class="v">${fmt.n(k.embarques)}</div><div class="d">${fmt.n(k.comAmostra)} com amostra · ${fmt.n(k.sacas)} sacas</div></div>
        <div class="kpi"><div class="t">Aderência peneira</div><div class="v">${k.aderenciaPeneira === null ? '–' : fmt.pct(k.aderenciaPeneira)}</div><div class="d">amostra × classificação dos lotes</div></div>
        <div class="kpi"><div class="t">Aderência tipo de produto</div><div class="v">${k.aderenciaTipo === null ? '–' : fmt.pct(k.aderenciaTipo)}</div><div class="d">amostra × tipo dos lotes</div></div>
        <div class="kpi"><div class="t">Aderência bebida</div><div class="v">${k.aderenciaBebida === null ? '–' : fmt.pct(k.aderenciaBebida)}</div><div class="d">${fmt.n(k.bebidaDiferente)} embarques com bebida diferente${k.semBebida ? ' · ' + fmt.n(k.semBebida) + ' sc sem bebida' : ''}</div></div>
        <div class="kpi"><div class="t">Defeito amostra / lotes</div><div class="v">${n(k.defeitoAmostra)} / ${n(k.defeitoLotes)}</div><div class="d">${k.acimaDefeito} embarques com lotes acima da amostra</div></div>
      </div>
      <div class="grade">
        <div class="card"><h2>Bebida: amostra vendida × embarcado</h2><p class="sub">Todos os embarques do filtro · lotes ponderados pelas sacas</p><div class="grafico"><canvas id="em-g-beb-geral"></canvas></div></div>
        <div class="card"><h2>Detalhe por bebida</h2>${tabelaBebida(d.bebidas, 'Amostra', 'Embarcado', { sacasB: 'Sacas embarcadas' })}
          <div class="legenda-calc">* Sacas esperadas = sacas embarcadas × % da bebida na amostra do contrato. Embarques cuja amostra não tem bebida e lotes sem bebida ficam fora da conta.</div></div>
        <div class="card ${resumo ? '' : 'full'}"><h2>Embarques</h2><p class="sub">Guia de embarque + contrato de venda · toque para detalhar</p>
          <input class="busca" id="em-busca" placeholder="Buscar guia, contrato, cliente, amostra ou tipo" value="${esc(estado.busca)}">
          <div class="tabela lista-contratos"><table><thead><tr><th>Guia</th><th>Data</th><th>Contrato</th><th class="esq">Cliente</th><th class="esq">Amostra</th><th>Sacas</th><th>Ader. peneira</th><th>Ader. tipo</th><th>Ader. bebida</th><th>Defeito am.</th><th>Defeito lotes</th></tr></thead>
          <tbody id="em-corpo">${linhasLista()}</tbody></table></div></div>
        ${resumo && !det ? `<div class="card" id="em-det"><h2>${resumo.consolidado ? `Contrato ${esc(resumo.contrato)} · todas as ${esc(resumo.guia)}` : `${esc(resumo.guia)} · ${esc(resumo.contrato)}`}</h2>
          ${detDados && detDados.erro ? `<div class="aviso">${esc(detDados.erro)}</div>` : '<p class="sub">Carregando detalhe…</p><div class="carregando" style="height:120px"></div>'}</div>` : ''}
        ${det ? `
        <div class="card" id="em-det"><h2>${det.consolidado ? `Contrato ${esc(det.contrato)} · todas as ${esc(det.guia)}` : `${esc(det.guia)} · ${esc(det.contrato)}`}</h2><p class="sub">${esc(det.cliente)} · ${periodo(det)} · amostra ${esc(det.amostras || '–')}</p>
          <div class="kpis mini">
            <div class="kpi"><div class="t">Sacas</div><div class="v">${fmt.n(det.sacas, 1)}</div><div class="d">${det.nLotes} lotes</div></div>
            <div class="kpi"><div class="t">Defeito amostra</div><div class="v">${n(det.defeitoAmostra)}</div></div>
            <div class="kpi"><div class="t">Defeito lotes</div><div class="v ${det.difDefeito > 0 ? 'neg' : ''}">${n(det.defeitoLotes)}</div><div class="d">${det.difDefeito === null ? '' : (det.difDefeito > 0 ? '+' : '') + fmt.n(det.difDefeito, 1) + ' vs amostra'}</div></div>
            <div class="kpi"><div class="t">Umidade lotes</div><div class="v">${det.umidadeLotes === null ? '–' : fmt.pct(det.umidadeLotes)}</div></div>
            <div class="kpi"><div class="t">Ader. bebida</div><div class="v">${det.aderenciaBebida === null ? '–' : fmt.pct(det.aderenciaBebida)}</div><div class="d">${det.semBebida ? fmt.n(det.semBebida, 1) + ' sc sem bebida' : ''}</div></div>
          </div>
          <div class="grafico"><canvas id="em-g-pen"></canvas></div></div>
        <div class="card"><h2>Classificação: amostra × lotes (peneira)</h2>${tabela(det.peneiras, 'Peneira', 'peneira')}</div>
        <div class="card"><h2>Amostra × tipo de produto dos lotes</h2><p class="sub">Peneiras da amostra e tipos dos lotes levados aos mesmos grupos</p><div class="grafico"><canvas id="em-g-tipo"></canvas></div></div>
        <div class="card"><h2>Por grupo</h2>${tabela(det.grupos, 'Grupo', 'grupo')}
          <div class="tabela" style="margin-top:10px"><table><thead><tr><th>Tipo de produto</th><th class="esq">Grupo(s)</th><th>Sacas</th></tr></thead>
          <tbody>${det.tiposDet.map((t) => `<tr><td>${esc(t.tipo)}</td><td class="esq">${esc(t.grupos)}</td><td>${fmt.n(t.sacas, 1)}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card"><h2>Bebida: amostra × lotes embarcados</h2><div class="grafico"><canvas id="em-g-beb"></canvas></div></div>
        <div class="card"><h2>Bebida do embarque</h2>${tabelaBebida(det.bebidas, 'Amostra', 'Embarcado', { sacasB: 'Sacas embarcadas' })}</div>
        ${det.porGuia ? `
        <div class="card full"><h2>Comparação entre as guias do contrato</h2><p class="sub">Cada guia contra a mesma amostra · toque numa guia para abrir</p>
          <div class="grafico"><canvas id="em-g-guias"></canvas></div>
          <div class="tabela" style="margin-top:10px"><table><thead><tr><th>Guia</th><th>Data</th><th>Lotes</th><th>Sacas</th><th>Ader. peneira</th><th>Ader. tipo</th><th>Ader. bebida</th><th>Defeito lotes</th><th>Dif. defeito</th><th>Umidade</th></tr></thead>
          <tbody>${det.porGuia.map((g) => `<tr class="click" data-chave="${esc(g.chave)}"><td>${esc(g.guia)}</td><td>${fmt.data(g.data)}</td><td>${g.nLotes}</td><td>${fmt.n(g.sacas, 1)}</td>
            <td>${aderenciaPill(g.aderenciaPeneira)}</td><td>${aderenciaPill(g.aderenciaTipo)}</td><td>${aderenciaPill(g.aderenciaBebida)}</td><td>${n(g.defeitoLotes)}</td>
            <td class="${g.difDefeito > 0 ? 'neg' : g.difDefeito < 0 ? 'pos' : ''}">${g.difDefeito === null ? '–' : (g.difDefeito > 0 ? '+' : '') + fmt.n(g.difDefeito, 1)}</td><td>${g.umidadeLotes ? fmt.pct(g.umidadeLotes) : '–'}</td></tr>`).join('')}
          <tr class="consol"><td><b>Σ Todas</b></td><td>${periodo(det)}</td><td>${det.nLotes}</td><td>${fmt.n(det.sacas, 1)}</td><td>${aderenciaPill(det.aderenciaPeneira)}</td><td>${aderenciaPill(det.aderenciaTipo)}</td><td>${aderenciaPill(det.aderenciaBebida)}</td><td>${n(det.defeitoLotes)}</td>
            <td class="${det.difDefeito > 0 ? 'neg' : det.difDefeito < 0 ? 'pos' : ''}">${det.difDefeito === null ? '–' : (det.difDefeito > 0 ? '+' : '') + fmt.n(det.difDefeito, 1)}</td><td>${det.umidadeLotes ? fmt.pct(det.umidadeLotes) : '–'}</td></tr></tbody></table></div></div>` : ''}
        <div class="card full"><h2>Lotes embarcados</h2>
          <div class="tabela"><table><thead><tr><th>Lote</th>${det.porGuia ? '<th>Guia</th>' : ''}<th class="esq">Bebida</th><th class="esq">Tipo</th><th>Sacas</th><th>Defeito</th><th>Umidade</th>${pens.map((p) => `<th>${esc(p)}</th>`).join('')}</tr></thead>
          <tbody>${det.amostrasDet.map((a) => `<tr style="background:#eef4fd"><td><b>Amostra ${esc(a.amostra)}</b></td>${det.porGuia ? '<td></td>' : ''}<td class="esq"><b>${esc(a.bebida || '–')}</b></td><td></td><td></td><td><b>${n(a.defeito)}</b></td><td></td>${pens.map((p) => `<td><b>${a.pct[p] ? fmt.pct(a.pct[p]) : '–'}</b></td>`).join('')}</tr>`).join('')}
            ${det.lotes.map((l) => `<tr><td>${esc(l.lote)}</td>${det.porGuia ? `<td>${esc(l.guia)}</td>` : ''}<td class="esq">${bebidaLote(l)}</td><td class="esq">${esc(l.tipo)}</td><td>${fmt.n(l.sacas, 1)}</td><td class="${det.defeitoAmostra !== null && l.defeito > det.defeitoAmostra ? 'neg' : ''}">${n(l.defeito)}</td><td>${l.umidade ? fmt.pct(l.umidade) : '–'}</td>
              ${pens.map((p) => `<td>${l.pct[p] ? fmt.pct(l.pct[p]) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>` : ''}
      </div>
      <div class="legenda-calc">Amostra = amostra do contrato de venda ligado à guia de embarque (média se houver mais de uma). Cliente = comprador do contrato de venda (se vazio, o destino da guia de saída).
      Ao filtrar um contrato com várias guias, a linha "Σ Todas" junta todos os lotes embarcados no contrato contra a amostra. Lotes ponderados pelas sacas embarcadas.
      Defeito do lote = campo Defeito do lote (ou o tipo de defeito, se vazio). Tipos de produto ligados aos grupos de config/mapeamento-gs.json.</div>`;
    graficoBebida('em-g-beb-geral', d.bebidas, 'Amostra vendida', 'Lotes embarcados');
    if (det) { gComp('em-g-pen', det.peneiras, 'peneira'); gComp('em-g-tipo', det.grupos, 'grupo'); graficoBebida('em-g-beb', det.bebidas, 'Amostra vendida', 'Lotes embarcados'); if (det.porGuia) gGuias('em-g-guias', det.porGuia); }
    const bx = document.getElementById('em-busca');
    let t = null;
    bx.oninput = () => { clearTimeout(t); t = setTimeout(() => { estado.busca = bx.value; estado.limite = PAGINA; document.getElementById('em-corpo').innerHTML = linhasLista(); ligarLista(); }, 150); };
    ligarLista();
    // linhas da tabela "comparação entre as guias" (no detalhe consolidado)
    document.getElementById('em-det')?.querySelectorAll('tr[data-chave]').forEach((tr) => tr.onclick = () => abrirEmbarque(tr.dataset.chave));
  }

  async function render(main) {
    main.innerHTML = `
      <h1>Amostra vendida × Lotes embarcados</h1>
      <p class="sub" id="em-atualizado">Carregando...</p>
      <form class="filtros" id="em-filtros">
        <label>Embarque de<input type="date" name="de"></label>
        <label>Até<input type="date" name="ate"></label>
        <label>Contrato<input name="contrato" list="em-contratos" placeholder="Todos" autocomplete="off"><datalist id="em-contratos"></datalist></label>
        <label>Cliente<select name="cliente"><option value="">Todos</option></select></label>
        <div style="display:flex;gap:6px"><button class="btn" type="submit">Aplicar</button><button class="btn sec" type="button" id="em-atualizar" title="Buscar dados novos no banco">↻</button></div>
      </form>
      <div id="em-area"></div>`;
    const form = document.getElementById('em-filtros');
    form.onsubmit = (ev) => { ev.preventDefault(); estado.filtros = { de: form.de.value, ate: form.ate.value, contrato: form.contrato.value.trim(), cliente: form.cliente.value }; estado.chave = null; carregar(); };
    document.getElementById('em-atualizar').onclick = () => carregar(true);
    await carregar();
  }

  BI.registrar({ id: 'embarque', titulo: 'Amostra vendida × Embarque', render });
})();
