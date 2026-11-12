// Relatório: Café despejado na Guia de Serviço (peneira) × Resultado da GS (tipo de produto)
(() => {
  const { api, fmt, esc, grafico, cor, aderenciaPill, difClasse } = BI;
  const estado = { aba: 'geral', filtros: { cobertura: '80' }, gs: null, busca: '', dados: null };

  function qs() {
    const f = estado.filtros, p = new URLSearchParams();
    for (const k of ['de', 'ate', 'armazem', 'cobertura']) if (f[k] !== undefined && f[k] !== '') p.set(k, f[k]);
    if (estado.gs) p.set('gs', estado.gs);
    return p;
  }

  async function carregar(atualizar = false) {
    const area = document.getElementById('gs-area');
    area.classList.add('carregando');
    try {
      const p = qs(); if (atualizar) p.set('atualizar', '1');
      estado.dados = await api('/api/gs?' + p.toString());
      document.getElementById('gs-atualizado').textContent = 'Dados de ' + new Date(estado.dados.atualizadoEm).toLocaleString('pt-BR');
      desenhar();
    } catch (e) {
      area.innerHTML = `<div class="aviso">${esc(e.message)}</div>`;
    } finally { area.classList.remove('carregando'); }
  }

  // ---------- gráficos ----------
  const eixoPct = { beginAtZero: true, ticks: { callback: (v) => v + '%' }, grid: { color: cor('--line') } };

  function gGrupos(id, linhas) {
    grafico(id, {
      type: 'bar',
      data: {
        labels: linhas.map((l) => l.grupo),
        datasets: [
          { label: 'Despejado (classificação)', data: linhas.map((l) => l.pctDespejado), backgroundColor: cor('--amostra'), borderRadius: 4, maxBarThickness: 36 },
          { label: 'Resultado (tipo de produto)', data: linhas.map((l) => l.pctResultado), backgroundColor: cor('--entrada'), borderRadius: 4, maxBarThickness: 36 },
        ],
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: { callbacks: {
            label: (c) => `${c.dataset.label}: ${fmt.pct(c.parsed.y)}`,
            afterBody: (it) => { const l = linhas[it[0].dataIndex]; return [`Sacas esperadas: ${fmt.n(l.sacasEsperadas, 1)}`, `Sacas resultado: ${fmt.n(l.sacasResultado, 1)}`, `Diferença: ${fmt.pp(l.diferenca)}`]; },
          } },
        },
        scales: { y: eixoPct, x: { grid: { display: false } } },
      },
    });
  }

  function gDifSacas(id, linhas) {
    grafico(id, {
      type: 'bar',
      data: { labels: linhas.map((l) => l.grupo), datasets: [{ label: 'Resultado − esperado', data: linhas.map((l) => l.difSacas), backgroundColor: linhas.map((l) => (l.difSacas >= 0 ? cor('--pos') : cor('--neg'))), borderRadius: 4, maxBarThickness: 36 }] },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt.n(c.parsed.y, 1) + ' sacas' } } },
        scales: { y: { ticks: { callback: (v) => fmt.n(v) }, grid: { color: cor('--line') } }, x: { grid: { display: false } } },
      },
    });
  }

  function gBarras(id, labels, valores, corBarra, horizontal = false, sufixo = '%') {
    grafico(id, {
      type: 'bar',
      data: { labels, datasets: [{ data: valores, backgroundColor: cor(corBarra), borderRadius: 4, maxBarThickness: 28 }] },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => (sufixo === '%' ? fmt.pct(horizontal ? c.parsed.x : c.parsed.y) : fmt.n(horizontal ? c.parsed.x : c.parsed.y, 1) + sufixo) } } },
        scales: horizontal
          ? { x: { beginAtZero: true, ticks: { callback: (v) => (sufixo === '%' ? v + '%' : fmt.n(v)) }, grid: { color: cor('--line') } }, y: { grid: { display: false } } }
          : { y: eixoPct, x: { grid: { display: false } } },
      },
    });
  }

  // ---------- tabelas ----------
  function tabelaGrupos(linhas) {
    const t = linhas.reduce((a, l) => ({ e: a.e + l.sacasEsperadas, r: a.r + l.sacasResultado }), { e: 0, r: 0 });
    return `<div class="tabela"><table>
      <thead><tr><th>Grupo</th><th>% despejado</th><th>% resultado</th><th>Diferença</th><th>Sacas esperadas*</th><th>Sacas resultado</th><th>Dif. sacas</th></tr></thead>
      <tbody>${linhas.map((l) => `<tr><td>${esc(l.grupo)}</td><td>${fmt.pct(l.pctDespejado)}</td><td>${fmt.pct(l.pctResultado)}</td>
        <td class="${difClasse(l.diferenca)}">${fmt.pp(l.diferenca)}</td><td>${fmt.n(l.sacasEsperadas, 1)}</td><td>${fmt.n(l.sacasResultado, 1)}</td>
        <td class="${difClasse(l.difSacas, 0.5)}">${fmt.n(l.difSacas, 1)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Total</th><th></th><th></th><th></th><th>${fmt.n(t.e, 1)}</th><th>${fmt.n(t.r, 1)}</th><th>${fmt.n(t.r - t.e, 1)}</th></tr></tfoot>
    </table></div>
    <div class="legenda-calc">* Sacas esperadas = sacas despejadas × % do grupo na classificação dos lotes despejados.
    A diferença do total é a quebra (resultado − despejado). Tipos que cobrem várias peneiras (ex.: 14/16) são divididos entre esses grupos na proporção do café despejado.</div>`;
  }

  function tabelaTipos(tipos) {
    return `<div class="tabela"><table><thead><tr><th>Tipo de produto</th><th class="esq">Grupo(s)</th><th>Sacas</th><th>%</th></tr></thead>
      <tbody>${tipos.map((t) => `<tr><td>${esc(t.tipo)}</td><td class="esq">${esc(t.grupos)}</td><td>${fmt.n(t.sacas, 1)}</td><td>${fmt.pct(t.pct)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ---------- abas ----------
  function abaGeral(d) {
    const k = d.kpis;
    const tiposTop = d.tipos.slice(0, 15);
    return `
      <div class="kpis">
        <div class="kpi"><div class="t">Guias comparadas</div><div class="v">${fmt.n(k.guiasComparaveis)}</div><div class="d">de ${fmt.n(k.guias)} no período · ${fmt.n(k.guiasSemClassificacao)} sem classificação</div></div>
        <div class="kpi"><div class="t">Café despejado</div><div class="v">${fmt.n(k.volumeDespejado)}</div><div class="d">sacas</div></div>
        <div class="kpi"><div class="t">Resultado</div><div class="v">${fmt.n(k.volumeResultado)}</div><div class="d">sacas</div></div>
        <div class="kpi"><div class="t">Rendimento</div><div class="v">${k.rendimento === null ? '–' : fmt.pct(k.rendimento)}</div><div class="d">resultado ÷ despejado</div></div>
        <div class="kpi"><div class="t">Resíduo / perdas</div><div class="v">${k.perdasPct === null ? '–' : fmt.pct(k.perdasPct)}</div><div class="d">${fmt.n(k.perdas, 1)} sacas do resultado</div></div>
        <div class="kpi"><div class="t">Aderência</div><div class="v">${k.aderencia === null ? '–' : fmt.pct(k.aderencia)}</div><div class="d">resultado igual à classificação</div></div>
      </div>
      ${d.grupos.length ? `<div class="grade">
        <div class="card"><h2>Despejado × Resultado por grupo</h2><p class="sub">% de cada grupo no café despejado (pela classificação) e no resultado (pelo tipo de produto)</p><div class="grafico"><canvas id="gs-g-grupos"></canvas></div></div>
        <div class="card"><h2>Diferença em sacas</h2><p class="sub">Verde: saiu mais do que a classificação indicava · Vermelho: saiu menos</p><div class="grafico"><canvas id="gs-g-dif"></canvas></div></div>
        <div class="card full"><h2>Detalhe por grupo</h2>${tabelaGrupos(d.grupos)}</div>
        <div class="card"><h2>Café despejado por peneira</h2><p class="sub">Classificação ponderada pelo volume dos lotes</p><div class="grafico"><canvas id="gs-g-pen"></canvas></div></div>
        <div class="card"><h2>Resultado por tipo de produto</h2><p class="sub">${d.tipos.length > 15 ? '15 maiores tipos · lista completa na aba Tipos' : 'Sacas por tipo'}</p><div class="grafico ${tiposTop.length > 8 ? 'alto' : ''}"><canvas id="gs-g-tipos"></canvas></div></div>
      </div>` : '<div class="card vazio">Nenhuma guia com café despejado classificado e resultado nesse filtro.</div>'}`;
  }

  function abaGuias(d) {
    const b = estado.busca.toLowerCase();
    const lista = d.guias.filter((g) => !b || g.gs.toLowerCase().includes(b) || g.armazem.toLowerCase().includes(b));
    const det = d.detalhe;
    return `<div class="grade">
      <div class="card ${det ? '' : 'full'}"><h2>Guias de serviço</h2><p class="sub">${fmt.n(lista.length)} guias · toque para detalhar</p>
        <input class="busca" id="gs-busca" placeholder="Buscar GS ou armazém" value="${esc(estado.busca)}">
        <div class="tabela lista-contratos"><table><thead><tr><th>GS</th><th>Data final</th><th class="esq">Armazém</th><th>Despejado</th><th>Resultado</th><th>Rend.</th><th>Classif.</th><th>Aderência</th></tr></thead>
        <tbody>${lista.map((g) => `<tr class="click ${g.gs === estado.gs ? 'sel' : ''}" data-gs="${esc(g.gs)}">
          <td>${esc(g.gs)}</td><td>${fmt.data(g.datafinal)}</td><td class="esq">${esc(g.armazem)}</td><td>${fmt.n(g.volumeDespejado, 1)}</td><td>${fmt.n(g.volumeResultado, 1)}</td>
          <td>${g.rendimento === null ? '–' : fmt.pct(g.rendimento)}</td><td>${fmt.pct(g.cobertura, 0)}</td>
          <td>${g.aderencia === null ? '<span class="pill">sem classif.</span>' : aderenciaPill(g.aderencia)}</td></tr>`).join('')}</tbody></table></div></div>
      ${det ? detalheGuia(det) : ''}
    </div>`;
  }

  function detalheGuia(det) {
    const pens = det.peneiras.map((p) => p.peneira);
    return `
      <div class="card"><h2>${esc(det.gs)} · ${esc(det.armazem)}</h2><p class="sub">Finalizada em ${fmt.data(det.datafinal)} · ${det.nLotesEntrada} lotes despejados → ${det.nLotesSaida} lotes de resultado</p>
        <div class="kpis mini">
          <div class="kpi"><div class="t">Despejado</div><div class="v">${fmt.n(det.volumeDespejado, 1)}</div></div>
          <div class="kpi"><div class="t">Resultado</div><div class="v">${fmt.n(det.volumeResultado, 1)}</div></div>
          <div class="kpi"><div class="t">Rendimento</div><div class="v">${det.rendimento === null ? '–' : fmt.pct(det.rendimento)}</div></div>
          <div class="kpi"><div class="t">Aderência</div><div class="v">${det.aderencia === null ? '–' : fmt.pct(det.aderencia)}</div></div>
        </div>
        ${det.cobertura === 0 ? '<div class="aviso">Nenhum lote despejado nesta guia tem classificação: não dá para comparar, só ver o resultado.</div>' : det.cobertura < 100 ? `<div class="aviso">Só ${fmt.pct(det.cobertura, 0)} do café despejado tem classificação. O esperado foi calculado com os lotes classificados.</div>` : ''}
        <div class="grafico"><canvas id="gs-g-det"></canvas></div></div>
      <div class="card"><h2>Comparativo por grupo</h2>${tabelaGrupos(det.grupos)}</div>
      <div class="card"><h2>Despejado por peneira</h2><div class="grafico"><canvas id="gs-g-det-pen"></canvas></div></div>
      <div class="card"><h2>Resultado por tipo de produto</h2>${tabelaTipos(det.tipos)}</div>
      <div class="card full"><h2>Lotes despejados</h2>
        <div class="tabela"><table><thead><tr><th>Lote</th><th>Sacas</th>${pens.map((p) => `<th>${esc(p)}</th>`).join('')}</tr></thead>
        <tbody>
          <tr style="background:#eef3f9"><td><b>Média ponderada</b></td><td><b>${fmt.n(det.volumeDespejado, 1)}</b></td>${det.peneiras.map((p) => `<td><b>${fmt.pct(p.pct)}</b></td>`).join('')}</tr>
          ${det.lotesEntrada.map((l) => `<tr><td>${esc(l.lote)}${!l.classificado ? ' <span class="pill ruim">sem classificação</span>' : l.porTipo ? ` <span class="pill bom" title="Lote saiu de outra GS: entra na comparação pelo tipo de produto">tipo ${esc(l.porTipo)}</span>` : l.somaOriginal !== 100 ? ` <span class="pill medio" title="Classificação original somava ${fmt.n(l.somaOriginal, 1)}%">${fmt.n(l.somaOriginal)}%</span>` : ''}</td>
            <td>${fmt.n(l.volume, 1)}</td>${pens.map((p) => `<td>${l.pct[p] ? fmt.pct(l.pct[p]) : '–'}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div></div>
      <div class="card full"><h2>Lotes de resultado</h2>
        <div class="tabela"><table><thead><tr><th>Lote</th><th class="esq">Tipo de produto</th><th class="esq">Grupo(s)</th><th>Sacas</th><th>Defeito</th></tr></thead>
        <tbody>${det.lotesSaida.map((l) => `<tr><td>${esc(l.lote)}</td><td class="esq">${esc(l.tipo)}</td><td class="esq">${esc(l.grupos)}</td><td>${fmt.n(l.volume, 1)}</td><td>${l.defeito === undefined || l.defeito === null ? '–' : fmt.n(l.defeito)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function abaTipos(d) {
    return `<div class="grade"><div class="card full"><h2>Como cada tipo de produto entra na comparação</h2>
      <p class="sub">Grupo(s) de peneira de cada tipo de produto do resultado. Se algum estiver errado, corrija em <b>config/mapeamento-gs.json</b> (seção "tipos") e reinicie o BI.</p>
      ${tabelaTipos(d.tipos)}</div>
      <div class="card full"><h2>Peneiras da classificação</h2><div class="tabela"><table><thead><tr><th>Peneira</th><th class="esq">Grupo</th><th>% no despejado</th></tr></thead>
      <tbody>${d.peneiras.map((p) => `<tr><td>${esc(p.peneira)}</td><td class="esq">${esc(p.grupo)}</td><td>${fmt.pct(p.pct)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
  }

  function desenhar() {
    const d = estado.dados;
    const area = document.getElementById('gs-area');
    document.querySelectorAll('#gs-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === estado.aba));
    if (estado.aba === 'geral') {
      area.innerHTML = abaGeral(d);
      if (d.grupos.length) {
        gGrupos('gs-g-grupos', d.grupos);
        gDifSacas('gs-g-dif', d.grupos);
        gBarras('gs-g-pen', d.peneiras.map((p) => p.peneira), d.peneiras.map((p) => p.pct), '--amostra');
        const top = d.tipos.slice(0, 15);
        gBarras('gs-g-tipos', top.map((t) => t.tipo), top.map((t) => t.sacas), '--entrada', true, ' sacas');
      }
    } else if (estado.aba === 'guias') {
      area.innerHTML = abaGuias(d);
      if (d.detalhe) {
        gGrupos('gs-g-det', d.detalhe.grupos);
        gBarras('gs-g-det-pen', d.detalhe.peneiras.map((p) => p.peneira), d.detalhe.peneiras.map((p) => p.pct), '--amostra');
      }
      const busca = document.getElementById('gs-busca');
      busca.oninput = () => { estado.busca = busca.value; const pos = busca.selectionStart; desenhar(); const nb = document.getElementById('gs-busca'); nb.focus(); nb.setSelectionRange(pos, pos); };
      area.querySelectorAll('tr[data-gs]').forEach((tr) => tr.onclick = async () => {
        estado.gs = tr.dataset.gs;
        await carregar();
        if (window.innerWidth < 860) document.getElementById('gs-g-det')?.closest('.card').scrollIntoView({ behavior: 'smooth' });
      });
    } else {
      area.innerHTML = abaTipos(d);
    }
  }

  async function render(main) {
    main.innerHTML = `
      <h1>Guia de Serviço: café despejado (peneira) × resultado (tipo de produto)</h1>
      <p class="sub" id="gs-atualizado">Carregando...</p>
      <form class="filtros" id="gs-filtros">
        <label>Finalizada de<input type="date" name="de"></label>
        <label>Até<input type="date" name="ate"></label>
        <label>Armazém<select name="armazem"><option value="">Todos</option></select></label>
        <label>Classificação mínima do despejado<select name="cobertura">
          <option value="100">100% classificado</option><option value="80">80% ou mais</option><option value="50">50% ou mais</option><option value="0">Qualquer</option></select></label>
        <div style="display:flex;gap:6px"><button class="btn" type="submit">Aplicar</button><button class="btn sec" type="button" id="gs-atualizar" title="Buscar dados novos no banco">↻</button></div>
      </form>
      <div class="abas" id="gs-abas">
        <button data-aba="geral">Visão geral</button>
        <button data-aba="guias">Por guia (GS)</button>
        <button data-aba="tipos">Tipos de produto</button>
      </div>
      <div id="gs-area"></div>`;
    const form = document.getElementById('gs-filtros');
    try {
      const op = await api('/api/gs/opcoes');
      form.armazem.innerHTML += op.armazens.map((a) => `<option>${esc(a)}</option>`).join('');
    } catch (e) { document.getElementById('gs-area').innerHTML = `<div class="aviso">${esc(e.message)}</div>`; return; }
    for (const [k, v] of Object.entries(estado.filtros)) if (form[k]) form[k].value = v || '';
    form.onsubmit = (ev) => {
      ev.preventDefault();
      estado.filtros = { de: form.de.value, ate: form.ate.value, armazem: form.armazem.value, cobertura: form.cobertura.value };
      carregar();
    };
    document.getElementById('gs-atualizar').onclick = () => carregar(true);
    document.querySelectorAll('#gs-abas button').forEach((b) => b.onclick = () => { estado.aba = b.dataset.aba; desenhar(); });
    await carregar();
  }

  BI.registrar({ id: 'gs', titulo: 'GS: Despejado × Resultado', render });
})();
