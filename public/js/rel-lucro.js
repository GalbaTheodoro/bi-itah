// Relatório: Lucro por lote vendido (custo pelos lotes GR de origem)
(() => {
  const { api, fmt, esc, grafico, cor } = BI;
  const estado = { filtros: {}, id: null, busca: '', dados: null };
  const brl = (v) => (v === null || v === undefined ? '–' : 'R$ ' + fmt.n(v, 2));
  const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

  async function carregar(atualizar = false) {
    const area = document.getElementById('lu-area');
    area.classList.add('carregando');
    try {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(estado.filtros)) if (v) p.set(k, v);
      if (estado.id) p.set('id', estado.id);
      if (atualizar) p.set('atualizar', '1');
      estado.dados = await api('/api/lucro?' + p.toString());
      document.getElementById('lu-atualizado').textContent = `Dados de ${new Date(estado.dados.atualizadoEm).toLocaleString('pt-BR')} · preços = Valor ÷ Quantidade do contrato${estado.dados.dolar ? ' · dólar R$ ' + fmt.n(estado.dados.dolar, 4) : ''}`;
      const sel = document.querySelector('#lu-filtros [name=cliente]');
      if (sel.options.length === 1) sel.innerHTML += estado.dados.opcoes.clientes.map((c) => `<option>${esc(c)}</option>`).join('');
      desenhar();
    } catch (e) { area.innerHTML = `<div class="aviso">${esc(e.message)}</div>`; } finally { area.classList.remove('carregando'); }
  }

  function desenhar() {
    const d = estado.dados, k = d.kpis, area = document.getElementById('lu-area');
    const b = estado.busca.toLowerCase();
    const lista = d.lotes.filter((l) => !b || l.lote.toLowerCase().includes(b) || l.guia.toLowerCase().includes(b) || l.contrato.toLowerCase().includes(b) || l.cliente.toLowerCase().includes(b));
    const det = d.lotes.find((l) => String(l.id) === String(estado.id) && l.origens);
    const top = d.lotes.filter((l) => l.lucro !== null).sort((a, b2) => Math.abs(b2.lucro) - Math.abs(a.lucro)).slice(0, 20);
    area.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="t">Lotes vendidos</div><div class="v">${fmt.n(k.lotesCalculados)}</div><div class="d">com lucro calculado, de ${fmt.n(k.lotes)}</div></div>
        <div class="kpi"><div class="t">Receita</div><div class="v">${brl(k.receita)}</div><div class="d">${fmt.n(k.sacas)} sacas</div></div>
        <div class="kpi"><div class="t">Custo inicial / total (lotes GR)</div><div class="v">${brl(k.custo)}</div><div class="d">inicial ${brl(k.custoIni)}</div></div>
        <div class="kpi"><div class="t">Lucro s/ custo total</div><div class="v ${cls(k.lucro)}">${brl(k.lucro)}</div><div class="d">${k.margem === null ? '' : fmt.pct(k.margem) + ' de margem · '}${brl(k.lucroSaca)}/sc</div></div>
        <div class="kpi"><div class="t">Lucro s/ custo inicial</div><div class="v ${cls(k.lucroIni)}">${brl(k.lucroIni)}</div></div>
        <div class="kpi"><div class="t">Sem preço venda / sem custo</div><div class="v">${k.semPrecoVenda} / ${k.semCusto}</div><div class="d">lotes fora da conta</div></div>
      </div>
      <div class="grade">
        <div class="card"><h2>Lucro por lote</h2><p class="sub">20 maiores lucros/prejuízos</p><div class="grafico alto"><canvas id="lu-g-lotes"></canvas></div></div>
        <div class="card"><h2>Lucro por cliente</h2><div class="tabela"><table><thead><tr><th class="esq">Cliente</th><th>Lotes</th><th>Sacas</th><th>Receita</th><th>Lucro</th><th>Margem</th></tr></thead>
          <tbody>${d.clientes.map((c) => `<tr><td class="esq">${esc(c.cliente)}</td><td>${c.lotes}</td><td>${fmt.n(c.sacas)}</td><td>${brl(c.receita)}</td><td class="${cls(c.lucro)}">${brl(c.lucro)}</td><td>${fmt.pct(c.margem)}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card full"><h2>Lotes vendidos</h2><p class="sub">Toque num lote para ver as GR de origem e o custo de cada uma</p>
          <input class="busca" id="lu-busca" placeholder="Buscar lote, guia de saída, contrato ou cliente" value="${esc(estado.busca)}">
          <div class="tabela lista-contratos"><table><thead><tr><th>Guia saída</th><th>Lote</th><th>Contrato venda</th><th class="esq">Cliente</th><th>Data</th><th class="esq">Tipo</th><th>Sacas</th><th>Preço contrato</th><th>Venda/sc (R$)</th><th>Custo inicial/sc</th><th>Custo total/sc</th><th>Lucro/sc</th><th>Lucro (total)</th><th>Lucro (inicial)</th><th>Margem</th><th>Rastreado</th></tr></thead>
          <tbody>${lista.map((l) => `<tr class="click ${String(l.id) === String(estado.id) ? 'sel' : ''}" data-id="${l.id}"><td>${esc(l.guia)}</td><td>${esc(l.lote)}</td><td>${esc(l.contrato)}</td><td class="esq">${esc(l.cliente)}</td><td>${fmt.data(l.data)}</td><td class="esq">${esc(l.tipo || '')}</td>
            <td>${fmt.n(l.sacas, 1)}</td><td>${l.precoContrato === null ? '–' : l.moeda + ' ' + fmt.n(l.precoContrato, 2)}</td><td>${brl(l.precoVenda)}</td><td>${brl(l.custoIniSaca)}</td><td>${brl(l.custoSaca)}</td><td class="${cls(l.lucroSaca)}">${brl(l.lucroSaca)}</td><td class="${cls(l.lucro)}">${brl(l.lucro)}</td><td class="${cls(l.lucroIni)}">${brl(l.lucroIni)}</td><td>${fmt.pct(l.margem)}</td>
            <td>${l.rastreado < 99.5 || l.comPreco < 99.5 ? `<span class="pill medio" title="com preço: ${fmt.pct(l.comPreco, 0)}">${fmt.pct(l.rastreado, 0)}</span>` : fmt.pct(l.rastreado, 0)}</td></tr>`).join('')}</tbody></table></div></div>
        ${det ? `<div class="card full"><h2>Origem do lote ${esc(det.lote)} · guia ${esc(det.guia)}</h2><p class="sub">Custo total/sc ${brl(det.custoSaca)} · inicial ${brl(det.custoIniSaca)} = média do custo dos lotes GR, pesada pela parte de cada um no lote vendido</p>
          <div class="tabela"><table><thead><tr><th>GR</th><th>Lote GR</th><th>Data</th><th>Contrato compra</th><th class="esq">Fornecedor</th><th>% do lote</th><th>Sacas</th><th>Custo inicial/sc</th><th>Custo total/sc</th><th>Custo</th></tr></thead>
          <tbody>${det.origens.map((o) => `<tr><td>${esc(o.guia)}</td><td>${esc(o.loteGR || '')}</td><td>${fmt.data(o.data)}</td><td>${esc(o.contrato || '–')}</td><td class="esq">${esc(o.fornecedor)}</td><td>${fmt.pct(o.pct)}</td><td>${fmt.n(o.sacas, 2)}</td><td>${brl(o.custoInicial)}${o.doContrato ? ' <span class="pill medio" title="lote sem custo: preço do contrato de compra">contrato</span>' : ''}</td><td>${brl(o.custoTotal)}</td><td>${brl(o.custo)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      </div>
      <div class="legenda-calc">Custo = custoInicial e custoTotal dos lotes GR de origem (lote sem custo usa o preço do contrato de compra). Venda = Valor ÷ Quantidade do contrato de venda (contrato de exportação IT em US$ × dólar informado; sem dólar, esses lotes ficam fora da conta). Custo rateado por volume: o lote vendido volta pelas guias de serviço e transferências até as GR (mesma regra da rastreabilidade do WMS). Rastreado = % das sacas que chegaram a uma GR. Lotes com origem sem preço usam o custo médio das partes com preço.</div>`;
    if (top.length) grafico('lu-g-lotes', { type: 'bar', data: { labels: top.map((l) => `${l.lote} (${l.guia})`), datasets: [{ data: top.map((l) => l.lucro), backgroundColor: top.map((l) => (l.lucro >= 0 ? cor('--pos') : cor('--neg'))), borderRadius: 4, maxBarThickness: 22 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => brl(c.parsed.x) } } }, scales: { x: { ticks: { callback: (v) => fmt.n(v) }, grid: { color: cor('--line') } }, y: { grid: { display: false } } } } });
    const busca = document.getElementById('lu-busca');
    busca.oninput = () => { estado.busca = busca.value; const pos = busca.selectionStart; desenhar(); const nb = document.getElementById('lu-busca'); nb.focus(); nb.setSelectionRange(pos, pos); };
    area.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = () => { estado.id = tr.dataset.id; carregar(); });
  }

  async function render(main) {
    main.innerHTML = `
      <h1>Lucro por lote vendido</h1>
      <p class="sub" id="lu-atualizado">Carregando... (o rastreio de todos os lotes pode levar alguns segundos)</p>
      <form class="filtros" id="lu-filtros">
        <label>Venda de<input type="date" name="de"></label>
        <label>Até<input type="date" name="ate"></label>
        <label>Cliente<select name="cliente"><option value="">Todos</option></select></label>
        <label>Dólar (contratos de exportação)<input name="dolar" inputmode="decimal" placeholder="ex.: 5,00"></label>
        <div style="display:flex;gap:6px"><button class="btn" type="submit">Aplicar</button><button class="btn sec" type="button" id="lu-atualizar" title="Buscar dados novos no banco">↻</button></div>
      </form>
      <div id="lu-area"></div>`;
    const form = document.getElementById('lu-filtros');
    form.onsubmit = (ev) => { ev.preventDefault(); estado.filtros = { de: form.de.value, ate: form.ate.value, cliente: form.cliente.value, dolar: form.dolar.value }; estado.id = null; carregar(); };
    document.getElementById('lu-atualizar').onclick = () => carregar(true);
    await carregar();
  }

  BI.registrar({ id: 'lucro', titulo: 'Lucro por lote', render });
})();
