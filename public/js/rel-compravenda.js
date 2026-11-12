// Relatório: Comprado × Vendido por peneira
(() => {
  const { api, fmt, esc, grafico, cor } = BI;
  const estado = { aba: 'peneira', filtros: { base: 'contratado', vendaPor: 'peneira' }, peneiraMes: '', busca: '', lado: '', dados: null };

  async function carregar(atualizar = false) {
    const area = document.getElementById('cv-area');
    area.classList.add('carregando');
    try {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(estado.filtros)) if (v) p.set(k, v);
      if (atualizar) p.set('atualizar', '1');
      estado.dados = await api('/api/cv?' + p.toString());
      document.getElementById('cv-atualizado').textContent = 'Dados de ' + new Date(estado.dados.atualizadoEm).toLocaleString('pt-BR');
      desenhar();
    } catch (e) { area.innerHTML = `<div class="aviso">${esc(e.message)}</div>`; } finally { area.classList.remove('carregando'); }
  }

  const eixoSacas = { beginAtZero: true, ticks: { callback: (v) => fmt.n(v) }, grid: { color: cor('--line') } };
  const legenda = { position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12 } };

  function gCompVend(id, labels, comprado, vendido, extra = {}) {
    grafico(id, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Comprado', data: comprado, backgroundColor: cor('--amostra'), borderRadius: 4, maxBarThickness: 34 },
        { label: 'Vendido', data: vendido, backgroundColor: cor('--entrada'), borderRadius: 4, maxBarThickness: 34 },
      ] },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: legenda, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.n(c.parsed.y, 1)} sc`, afterBody: (it) => 'Saldo: ' + fmt.n(comprado[it[0].dataIndex] - vendido[it[0].dataIndex], 1) + ' sc' } } },
        scales: { y: eixoSacas, x: { grid: { display: false } } }, ...extra,
      },
    });
  }

  function gSaldo(id, linhas) {
    grafico(id, {
      type: 'bar',
      data: { labels: linhas.map((l) => l.peneira), datasets: [{ data: linhas.map((l) => l.saldo), backgroundColor: linhas.map((l) => (l.saldo >= 0 ? cor('--pos') : cor('--neg'))), borderRadius: 4, maxBarThickness: 34 }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt.n(c.parsed.y, 1) + ' sc' } } }, scales: { y: { ticks: { callback: (v) => fmt.n(v) }, grid: { color: cor('--line') } }, x: { grid: { display: false } } } },
    });
  }

  function gPctMix(id, linhas) {
    grafico(id, {
      type: 'bar',
      data: { labels: linhas.map((l) => l.peneira), datasets: [
        { label: '% do comprado', data: linhas.map((l) => l.pctComprado), backgroundColor: cor('--amostra'), borderRadius: 4, maxBarThickness: 34 },
        { label: '% do vendido', data: linhas.map((l) => l.pctVendido), backgroundColor: cor('--entrada'), borderRadius: 4, maxBarThickness: 34 },
      ] },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: legenda, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.pct(c.parsed.y)}` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + '%' }, grid: { color: cor('--line') } }, x: { grid: { display: false } } } },
    });
  }

  function abaPeneira(d) {
    const k = d.kpis, fis = estado.filtros.base === 'fisico', tipo = d.porGrupo;
    const nome = tipo ? 'Grupo' : 'Peneira';
    const t = d.peneiras.reduce((a, l) => ({ c: a.c + l.comprado, v: a.v + l.vendido }), { c: 0, v: 0 });
    return `
      <div class="kpis">
        <div class="kpi"><div class="t">${fis ? 'Recebido (lotes de compra)' : 'Comprado (contratos)'}</div><div class="v">${fmt.n(k.comprado)}</div><div class="d">sacas · ${fmt.n(k.contratosCompra)} contratos</div></div>
        <div class="kpi"><div class="t">${tipo ? 'Vendido (lotes por tipo de produto)' : fis ? 'Entregue (lotes de venda)' : 'Vendido (contratos)'}</div><div class="v">${fmt.n(k.vendido)}</div><div class="d">sacas · ${fmt.n(k.contratosVenda)} contratos</div></div>
        <div class="kpi"><div class="t">Saldo</div><div class="v ${k.saldo >= 0 ? 'pos' : 'neg'}">${fmt.n(k.saldo)}</div><div class="d">comprado − vendido</div></div>
        ${fis || tipo ? `<div class="kpi"><div class="t">${tipo ? 'Sem classificação / sem tipo' : 'Lotes sem classificação'}</div><div class="v">${fmt.n(k.semClassCompra)} / ${fmt.n(k.semClassVenda)}</div><div class="d">sacas compra / venda (fora da conta)</div></div>` : ''}
      </div>
      ${d.peneiras.length ? `<div class="grade">
        <div class="card"><h2>Comprado × Vendido por ${tipo ? 'grupo' : 'peneira'}</h2><p class="sub">${tipo ? `Compra pela classificação (${fis ? 'lotes recebidos' : 'amostra do contrato'}) · venda pelo tipo de produto dos lotes vendidos` : fis ? 'Sacas dos lotes × classificação de cada lote' : 'Sacas do contrato × % da amostra do contrato'}</p><div class="grafico"><canvas id="cv-g-pen"></canvas></div></div>
        <div class="card"><h2>Saldo por ${tipo ? 'grupo' : 'peneira'}</h2><p class="sub">Verde: comprou mais do que vendeu · Vermelho: vendeu mais do que comprou</p><div class="grafico"><canvas id="cv-g-saldo"></canvas></div></div>
        <div class="card"><h2>Mix: % de cada ${tipo ? 'grupo' : 'peneira'}</h2><p class="sub">Compara o perfil do que entra com o do que sai</p><div class="grafico"><canvas id="cv-g-mix"></canvas></div></div>
        <div class="card"><h2>Detalhe por ${tipo ? 'grupo' : 'peneira'}</h2>
          <div class="tabela"><table><thead><tr><th>${nome}</th><th>Comprado</th><th>% compra</th><th>Vendido</th><th>% venda</th><th>Saldo</th></tr></thead>
          <tbody>${d.peneiras.map((l) => `<tr><td>${esc(l.peneira)}</td><td>${fmt.n(l.comprado, 1)}</td><td>${fmt.pct(l.pctComprado)}</td><td>${fmt.n(l.vendido, 1)}</td><td>${fmt.pct(l.pctVendido)}</td>
            <td class="${l.saldo >= 0.5 ? 'pos' : l.saldo <= -0.5 ? 'neg' : ''}">${fmt.n(l.saldo, 1)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><th>Total</th><th>${fmt.n(t.c, 1)}</th><th></th><th>${fmt.n(t.v, 1)}</th><th></th><th>${fmt.n(t.c - t.v, 1)}</th></tr></tfoot></table></div>
          ${tipo ? '<div class="legenda-calc">Peneiras e tipos de produto ligados pelos grupos de config/mapeamento-gs.json (os mesmos do relatório de GS). Tipos que cobrem várias peneiras (ex.: 14/16) são divididos na proporção do que foi comprado desses grupos.</div>' : ''}</div>
        ${tipo && d.tiposVendidos ? `<div class="card full"><h2>Vendido por tipo de produto</h2><div class="tabela"><table><thead><tr><th>Tipo de produto</th><th class="esq">Grupo(s)</th><th>Sacas</th><th>%</th></tr></thead>
          <tbody>${d.tiposVendidos.map((x) => `<tr><td>${esc(x.tipo)}</td><td class="esq">${esc(x.grupos)}</td><td>${fmt.n(x.sacas, 1)}</td><td>${fmt.pct(x.pct)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      </div>` : '<div class="card vazio">Nada encontrado nesse filtro.</div>'}`;
  }

  function abaMes(d) {
    const pens = d.peneiras.map((p) => p.peneira);
    return `<div class="grade">
      <div class="card full"><h2>Comprado × Vendido por mês</h2>
        <p class="sub">Pela data do contrato · <label>Peneira: <select id="cv-pen-mes"><option value="">Todas</option>${pens.map((p) => `<option ${p === estado.peneiraMes ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label></p>
        <div class="grafico alto"><canvas id="cv-g-mes"></canvas></div></div>
      <div class="card full"><h2>Tabela por mês</h2><div class="tabela"><table><thead><tr><th>Mês</th><th>Comprado</th><th>Vendido</th><th>Saldo do mês</th><th>Saldo acumulado</th></tr></thead>
        <tbody>${(() => { let acc = 0; return serieMes(d).map((m) => { acc += m.c - m.v; return `<tr><td>${esc(m.rotulo)}</td><td>${fmt.n(m.c, 1)}</td><td>${fmt.n(m.v, 1)}</td><td class="${m.c - m.v >= 0 ? 'pos' : 'neg'}">${fmt.n(m.c - m.v, 1)}</td><td>${fmt.n(acc, 1)}</td></tr>`; }).join(''); })()}</tbody></table></div></div>
    </div>`;
  }

  function serieMes(d) {
    const p = estado.peneiraMes;
    return d.porMes.map((m) => ({
      rotulo: m.mes === 'sem data' ? m.mes : m.mes.split('-').reverse().join('/'),
      c: p ? m.porPeneira[p]?.comprado || 0 : m.comprado,
      v: p ? m.porPeneira[p]?.vendido || 0 : m.vendido,
    }));
  }

  function tabelaPartes(lista, pens, titulo) {
    return `<div class="card full"><h2>${titulo}</h2><div class="tabela lista-contratos"><table><thead><tr><th class="esq">Nome</th><th>Contratos</th><th>Total</th>${pens.map((p) => `<th>${esc(p)}</th>`).join('')}</tr></thead>
      <tbody>${lista.map((x) => `<tr><td class="esq">${esc(x.nome)}</td><td>${x.contratos}</td><td><b>${fmt.n(x.total, 1)}</b></td>${pens.map((p) => `<td>${x.sacas[p] ? fmt.n(x.sacas[p], 1) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }

  function abaPartes(d) {
    const pens = d.peneiras.map((p) => p.peneira);
    return `<div class="grade">${tabelaPartes(d.fornecedores, pens, 'Fornecedores (compra) · sacas por peneira')}${tabelaPartes(d.clientes, pens, 'Clientes (venda) · sacas por peneira')}</div>`;
  }

  function abaContratos(d) {
    const pens = d.peneiras.map((p) => p.peneira);
    const b = estado.busca.toLowerCase();
    const fis = estado.filtros.base === 'fisico';
    const lista = d.contratos.filter((c) => (!estado.lado || c.lado === estado.lado) && (!b || c.contrato.toLowerCase().includes(b) || (c.parte || '').toLowerCase().includes(b)));
    return `<div class="card"><h2>Contratos</h2><p class="sub">${fmt.n(lista.length)} contratos · sacas por ${d.porGrupo ? 'grupo' : 'peneira'}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><input class="busca" id="cv-busca" style="flex:1;min-width:180px;margin:0" placeholder="Buscar contrato, fornecedor ou cliente" value="${esc(estado.busca)}">
      <select id="cv-lado" class="busca" style="width:auto;margin:0"><option value="">Compra e venda</option><option ${estado.lado === 'Compra' ? 'selected' : ''}>Compra</option><option ${estado.lado === 'Venda' ? 'selected' : ''}>Venda</option></select></div>
      <div class="tabela lista-contratos"><table><thead><tr><th>Tipo</th><th>Contrato</th><th class="esq">Fornecedor / cliente</th><th>Data</th><th>Qtde</th>${fis ? '<th>Lotes</th><th>Sacas lotes</th>' : '<th class="esq">Amostra</th>'}${pens.map((p) => `<th>${esc(p)}</th>`).join('')}</tr></thead>
      <tbody>${lista.map((c) => `<tr><td><span class="pill ${c.lado === 'Compra' ? 'bom' : 'medio'}">${c.lado}</span></td><td>${esc(c.contrato)}</td><td class="esq">${esc(c.parte)}</td><td>${fmt.data(c.data)}</td><td>${fmt.n(c.quantidade)}</td>
        ${fis ? `<td>${c.nLotes ?? '–'}</td><td>${fmt.n(c.volume, 1)}${c.semClassificacao ? ` <span class="pill ruim" title="sacas sem classificação">${fmt.n(c.semClassificacao)} s/ class.</span>` : ''}</td>` : `<td class="esq" title="${esc(c.tipos || '')}">${esc(c.amostras || (c.tipos ? 'lotes: ' + c.tipos : ''))}</td>`}
        ${pens.map((p) => `<td>${c.sacas[p] ? fmt.n(c.sacas[p], 1) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }

  function desenhar() {
    const d = estado.dados, area = document.getElementById('cv-area');
    document.querySelectorAll('#cv-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === estado.aba));
    if (estado.aba === 'peneira') {
      area.innerHTML = abaPeneira(d);
      if (d.peneiras.length) {
        gCompVend('cv-g-pen', d.peneiras.map((l) => l.peneira), d.peneiras.map((l) => l.comprado), d.peneiras.map((l) => l.vendido));
        gSaldo('cv-g-saldo', d.peneiras);
        gPctMix('cv-g-mix', d.peneiras);
      }
    } else if (estado.aba === 'mes') {
      area.innerHTML = abaMes(d);
      const s = serieMes(d);
      gCompVend('cv-g-mes', s.map((m) => m.rotulo), s.map((m) => m.c), s.map((m) => m.v));
      document.getElementById('cv-pen-mes').onchange = (e) => { estado.peneiraMes = e.target.value; desenhar(); };
    } else if (estado.aba === 'partes') {
      area.innerHTML = abaPartes(d);
    } else {
      area.innerHTML = abaContratos(d);
      const busca = document.getElementById('cv-busca');
      busca.oninput = () => { estado.busca = busca.value; const pos = busca.selectionStart; desenhar(); const nb = document.getElementById('cv-busca'); nb.focus(); nb.setSelectionRange(pos, pos); };
      document.getElementById('cv-lado').onchange = (e) => { estado.lado = e.target.value; desenhar(); };
    }
  }

  async function render(main) {
    main.innerHTML = `
      <h1>Comprado × Vendido</h1>
      <p class="sub" id="cv-atualizado">Carregando...</p>
      <form class="filtros" id="cv-filtros">
        <label>Vendido por<select name="vendaPor"><option value="peneira">Peneira (classificação)</option><option value="tipo">Tipo de produto (lotes vendidos)</option></select></label>
        <label>Base<select name="base"><option value="contratado">Contratado (amostra do contrato)</option><option value="fisico">Físico (lotes)</option></select></label>
        <label>Contratos de<input type="date" name="de"></label>
        <label>Até<input type="date" name="ate"></label>
        <label>Fornecedor<select name="fornecedor"><option value="">Todos</option></select></label>
        <label>Cliente<select name="cliente"><option value="">Todos</option></select></label>
        <div style="display:flex;gap:6px"><button class="btn" type="submit">Aplicar</button><button class="btn sec" type="button" id="cv-atualizar" title="Buscar dados novos no banco">↻</button></div>
      </form>
      <div class="abas" id="cv-abas">
        <button data-aba="peneira">Por peneira</button><button data-aba="mes">Por mês</button>
        <button data-aba="partes">Fornecedores × Clientes</button><button data-aba="contratos">Contratos</button>
      </div>
      <div id="cv-area"></div>`;
    const form = document.getElementById('cv-filtros');
    try {
      const op = await api('/api/cv/opcoes');
      form.fornecedor.innerHTML += op.fornecedores.map((x) => `<option>${esc(x)}</option>`).join('');
      form.cliente.innerHTML += op.clientes.map((x) => `<option>${esc(x)}</option>`).join('');
    } catch (e) { document.getElementById('cv-area').innerHTML = `<div class="aviso">${esc(e.message)}</div>`; return; }
    for (const [k, v] of Object.entries(estado.filtros)) if (form[k]) form[k].value = v || '';
    form.onsubmit = (ev) => {
      ev.preventDefault();
      estado.filtros = { vendaPor: form.vendaPor.value, base: form.base.value, de: form.de.value, ate: form.ate.value, fornecedor: form.fornecedor.value, cliente: form.cliente.value };
      carregar();
    };
    form.base.onchange = () => form.requestSubmit();
    form.vendaPor.onchange = () => form.requestSubmit();
    document.getElementById('cv-atualizar').onclick = () => carregar(true);
    document.querySelectorAll('#cv-abas button').forEach((b) => b.onclick = () => { estado.aba = b.dataset.aba; desenhar(); });
    await carregar();
  }

  BI.registrar({ id: 'compravenda', titulo: 'Comprado × Vendido', render });
})();
