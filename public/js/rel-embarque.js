// Relatório: Amostra vendida (contrato da guia de embarque) × Lotes embarcados
(() => {
  const { api, fmt, esc, grafico, cor, aderenciaPill, difClasse } = BI;
  const estado = { filtros: {}, chave: null, busca: '', dados: null };
  const n = (v, d = 1) => (v === null || v === undefined ? '–' : fmt.n(v, d));

  async function carregar(atualizar = false) {
    const area = document.getElementById('em-area');
    area.classList.add('carregando');
    try {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(estado.filtros)) if (v) p.set(k, v);
      if (estado.chave) p.set('chave', estado.chave);
      if (atualizar) p.set('atualizar', '1');
      estado.dados = await api('/api/embarque?' + p.toString());
      document.getElementById('em-atualizado').textContent = 'Dados de ' + new Date(estado.dados.atualizadoEm).toLocaleString('pt-BR');
      const sel = document.querySelector('#em-filtros [name=cliente]');
      if (sel.options.length === 1) sel.innerHTML += estado.dados.clientes.map((c) => `<option>${esc(c)}</option>`).join('');
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

  function tabela(linhas, nome, chave) {
    return `<div class="tabela"><table><thead><tr><th>${nome}</th><th>Amostra</th><th>Lotes</th><th>Diferença</th></tr></thead>
      <tbody>${linhas.map((l) => `<tr><td>${esc(l[chave])}</td><td>${fmt.pct(l.amostra)}</td><td>${fmt.pct(l.lotes)}</td><td class="${difClasse(l.diferenca)}">${fmt.pp(l.diferenca)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function desenhar() {
    const d = estado.dados, k = d.kpis, area = document.getElementById('em-area');
    const b = estado.busca.toLowerCase();
    const lista = d.embarques.filter((e) => !b || [e.guia, e.contrato, e.cliente, e.amostras, e.tipos].join(' ').toLowerCase().includes(b));
    const det = d.detalhe;
    const pens = det ? det.peneiras.map((p) => p.peneira) : [];
    area.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="t">Embarques</div><div class="v">${fmt.n(k.embarques)}</div><div class="d">${fmt.n(k.comAmostra)} com amostra · ${fmt.n(k.sacas)} sacas</div></div>
        <div class="kpi"><div class="t">Aderência peneira</div><div class="v">${k.aderenciaPeneira === null ? '–' : fmt.pct(k.aderenciaPeneira)}</div><div class="d">amostra × classificação dos lotes</div></div>
        <div class="kpi"><div class="t">Aderência tipo de produto</div><div class="v">${k.aderenciaTipo === null ? '–' : fmt.pct(k.aderenciaTipo)}</div><div class="d">amostra × tipo dos lotes</div></div>
        <div class="kpi"><div class="t">Defeito amostra / lotes</div><div class="v">${n(k.defeitoAmostra)} / ${n(k.defeitoLotes)}</div><div class="d">${k.acimaDefeito} embarques com lotes acima da amostra</div></div>
      </div>
      <div class="grade">
        <div class="card ${det ? '' : 'full'}"><h2>Embarques</h2><p class="sub">Guia de embarque + contrato de venda · toque para detalhar</p>
          <input class="busca" id="em-busca" placeholder="Buscar guia, contrato, cliente, amostra ou tipo" value="${esc(estado.busca)}">
          <div class="tabela lista-contratos"><table><thead><tr><th>Guia</th><th>Data</th><th>Contrato</th><th class="esq">Cliente</th><th class="esq">Amostra</th><th>Sacas</th><th>Ader. peneira</th><th>Ader. tipo</th><th>Defeito am.</th><th>Defeito lotes</th></tr></thead>
          <tbody>${lista.map((e) => `<tr class="click ${e.chave === estado.chave ? 'sel' : ''}" data-chave="${esc(e.chave)}"><td>${esc(e.guia)}</td><td>${fmt.data(e.data)}</td><td>${esc(e.contrato)}</td>
            <td class="esq">${esc(e.cliente)}</td><td class="esq">${esc(e.amostras || 'sem amostra')}</td><td>${fmt.n(e.sacas, 1)}</td>
            <td>${aderenciaPill(e.aderenciaPeneira)}</td><td>${aderenciaPill(e.aderenciaTipo)}</td><td>${n(e.defeitoAmostra)}</td>
            <td class="${e.difDefeito > 0 ? 'neg' : e.difDefeito < 0 ? 'pos' : ''}">${n(e.defeitoLotes)}</td></tr>`).join('')}</tbody></table></div></div>
        ${det ? `
        <div class="card"><h2>${esc(det.guia)} · ${esc(det.contrato)}</h2><p class="sub">${esc(det.cliente)} · ${fmt.data(det.data)} · amostra ${esc(det.amostras || '–')}</p>
          <div class="kpis mini">
            <div class="kpi"><div class="t">Sacas</div><div class="v">${fmt.n(det.sacas, 1)}</div><div class="d">${det.nLotes} lotes</div></div>
            <div class="kpi"><div class="t">Defeito amostra</div><div class="v">${n(det.defeitoAmostra)}</div></div>
            <div class="kpi"><div class="t">Defeito lotes</div><div class="v ${det.difDefeito > 0 ? 'neg' : ''}">${n(det.defeitoLotes)}</div><div class="d">${det.difDefeito === null ? '' : (det.difDefeito > 0 ? '+' : '') + fmt.n(det.difDefeito, 1) + ' vs amostra'}</div></div>
            <div class="kpi"><div class="t">Umidade lotes</div><div class="v">${det.umidadeLotes === null ? '–' : fmt.pct(det.umidadeLotes)}</div></div>
          </div>
          <div class="grafico"><canvas id="em-g-pen"></canvas></div></div>
        <div class="card"><h2>Classificação: amostra × lotes (peneira)</h2>${tabela(det.peneiras, 'Peneira', 'peneira')}</div>
        <div class="card"><h2>Amostra × tipo de produto dos lotes</h2><p class="sub">Peneiras da amostra e tipos dos lotes levados aos mesmos grupos</p><div class="grafico"><canvas id="em-g-tipo"></canvas></div></div>
        <div class="card"><h2>Por grupo</h2>${tabela(det.grupos, 'Grupo', 'grupo')}
          <div class="tabela" style="margin-top:10px"><table><thead><tr><th>Tipo de produto</th><th class="esq">Grupo(s)</th><th>Sacas</th></tr></thead>
          <tbody>${det.tiposDet.map((t) => `<tr><td>${esc(t.tipo)}</td><td class="esq">${esc(t.grupos)}</td><td>${fmt.n(t.sacas, 1)}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card full"><h2>Lotes embarcados</h2>
          <div class="tabela"><table><thead><tr><th>Lote</th><th class="esq">Tipo</th><th>Sacas</th><th>Defeito</th><th>Umidade</th>${pens.map((p) => `<th>${esc(p)}</th>`).join('')}</tr></thead>
          <tbody>${det.amostrasDet.map((a) => `<tr style="background:#eef4fd"><td><b>Amostra ${esc(a.amostra)}</b></td><td></td><td></td><td><b>${n(a.defeito)}</b></td><td></td>${pens.map((p) => `<td><b>${a.pct[p] ? fmt.pct(a.pct[p]) : '–'}</b></td>`).join('')}</tr>`).join('')}
            ${det.lotes.map((l) => `<tr><td>${esc(l.lote)}</td><td class="esq">${esc(l.tipo)}</td><td>${fmt.n(l.sacas, 1)}</td><td class="${det.defeitoAmostra !== null && l.defeito > det.defeitoAmostra ? 'neg' : ''}">${n(l.defeito)}</td><td>${l.umidade ? fmt.pct(l.umidade) : '–'}</td>
              ${pens.map((p) => `<td>${l.pct[p] ? fmt.pct(l.pct[p]) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>` : ''}
      </div>
      <div class="legenda-calc">Amostra = amostra do contrato de venda ligado à guia de embarque (média se houver mais de uma). Lotes ponderados pelas sacas embarcadas.
      Defeito do lote = campo Defeito do lote (ou o tipo de defeito, se vazio). Tipos de produto ligados aos grupos de config/mapeamento-gs.json.</div>`;
    if (det) { gComp('em-g-pen', det.peneiras, 'peneira'); gComp('em-g-tipo', det.grupos, 'grupo'); }
    const bx = document.getElementById('em-busca');
    bx.oninput = () => { estado.busca = bx.value; const pos = bx.selectionStart; desenhar(); const nb = document.getElementById('em-busca'); nb.focus(); nb.setSelectionRange(pos, pos); };
    area.querySelectorAll('tr[data-chave]').forEach((tr) => tr.onclick = async () => {
      estado.chave = tr.dataset.chave; await carregar();
      if (window.innerWidth < 860) document.getElementById('em-g-pen')?.closest('.card').scrollIntoView({ behavior: 'smooth' });
    });
  }

  async function render(main) {
    main.innerHTML = `
      <h1>Amostra vendida × Lotes embarcados</h1>
      <p class="sub" id="em-atualizado">Carregando...</p>
      <form class="filtros" id="em-filtros">
        <label>Embarque de<input type="date" name="de"></label>
        <label>Até<input type="date" name="ate"></label>
        <label>Cliente<select name="cliente"><option value="">Todos</option></select></label>
        <div style="display:flex;gap:6px"><button class="btn" type="submit">Aplicar</button><button class="btn sec" type="button" id="em-atualizar" title="Buscar dados novos no banco">↻</button></div>
      </form>
      <div id="em-area"></div>`;
    const form = document.getElementById('em-filtros');
    form.onsubmit = (ev) => { ev.preventDefault(); estado.filtros = { de: form.de.value, ate: form.ate.value, cliente: form.cliente.value }; estado.chave = null; carregar(); };
    document.getElementById('em-atualizar').onclick = () => carregar(true);
    await carregar();
  }

  BI.registrar({ id: 'embarque', titulo: 'Amostra vendida × Embarque', render });
})();
