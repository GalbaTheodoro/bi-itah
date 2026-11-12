// Relatório: Classificação da Amostra de compra x Classificação dos Lotes de entrada
(() => {
  const { api, fmt, esc, grafico, cor, aderenciaPill, difClasse } = BI;

  const estado = { aba: 'geral', filtros: {}, fornecedor: null, contrato: null, busca: '', dados: null, opcoes: null };

  function qs() {
    const f = estado.filtros, p = new URLSearchParams();
    if (f.de) p.set('de', f.de);
    if (f.ate) p.set('ate', f.ate);
    if (f.base) p.set('base', f.base);
    if (f.fornecedor) p.set('fornecedor', f.fornecedor);
    if (f.armazem) p.set('armazem', f.armazem);
    if (f.todos) p.set('todos', '1');
    if (estado.contrato) p.set('contrato', estado.contrato);
    return p;
  }

  async function carregar(atualizar = false) {
    const area = document.getElementById('cmp-area');
    area.classList.add('carregando');
    try {
      const p = qs(); if (atualizar) p.set('atualizar', '1');
      estado.dados = await api('/api/comparativo?' + p.toString());
      document.getElementById('cmp-atualizado').textContent = 'Dados de ' + new Date(estado.dados.atualizadoEm).toLocaleString('pt-BR');
      desenhar();
    } catch (e) {
      area.innerHTML = `<div class="aviso">${esc(e.message)}</div>`;
    } finally {
      area.classList.remove('carregando');
    }
  }

  // ---------- Gráficos ----------
  function graficoComparativo(id, linhas) {
    grafico(id, {
      type: 'bar',
      data: {
        labels: linhas.map((l) => l.peneira),
        datasets: [
          { label: 'Amostra (compra)', data: linhas.map((l) => l.amostra), backgroundColor: cor('--amostra'), borderRadius: 4, maxBarThickness: 36 },
          { label: 'Lotes de entrada', data: linhas.map((l) => l.entrada), backgroundColor: cor('--entrada'), borderRadius: 4, maxBarThickness: 36 },
        ],
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.pct(c.parsed.y)}`, afterBody: (it) => { const l = linhas[it[0].dataIndex]; return 'Diferença: ' + fmt.pp(l.diferenca); } } },
        },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + '%' }, grid: { color: cor('--line') } }, x: { grid: { display: false } } },
      },
    });
  }

  function graficoDiferenca(id, linhas) {
    grafico(id, {
      type: 'bar',
      data: {
        labels: linhas.map((l) => l.peneira),
        datasets: [{ label: 'Entrada − Amostra', data: linhas.map((l) => l.diferenca), backgroundColor: linhas.map((l) => (l.diferenca >= 0 ? cor('--pos') : cor('--neg'))), borderRadius: 4 }],
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt.pp(c.parsed.y) } } },
        scales: { y: { ticks: { callback: (v) => (v > 0 ? '+' : '') + v + ' p.p.' }, grid: { color: cor('--line') } }, x: { grid: { display: false } } },
      },
    });
  }

  function graficoAderencia(id, itens, rotulo) {
    grafico(id, {
      type: 'bar',
      data: {
        labels: itens.map(rotulo),
        datasets: [{ label: 'Aderência', data: itens.map((i) => i.aderencia), backgroundColor: itens.map((i) => (i.aderencia >= 90 ? cor('--pos') : i.aderencia >= 75 ? cor('--entrada') : cor('--neg'))), borderRadius: 4, maxBarThickness: 26 }],
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => 'Aderência: ' + fmt.pct(c.parsed.x) } } },
        scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + '%' }, grid: { color: cor('--line') } }, y: { grid: { display: false } } },
      },
    });
  }

  // ---------- Tabelas ----------
  function tabelaPeneiras(linhas, comSacas = true) {
    const tot = linhas.reduce((s, l) => s + (l.sacasEntradas || 0), 0);
    return `<div class="tabela"><table>
      <thead><tr><th>Peneira</th><th>Amostra</th><th>Entrada</th><th>Diferença</th>
      ${comSacas ? '<th>Sacas entradas</th><th>Sacas esperadas*</th><th>Dif. sacas</th>' : ''}</tr></thead>
      <tbody>${linhas.map((l) => `<tr>
        <td>${esc(l.peneira)}</td><td>${fmt.pct(l.amostra)}</td><td>${fmt.pct(l.entrada)}</td>
        <td class="${difClasse(l.diferenca)}">${fmt.pp(l.diferenca)}</td>
        ${comSacas ? `<td>${fmt.n(l.sacasEntradas, 1)}</td><td>${fmt.n(l.sacasPrevistasNoEntrado, 1)}</td>
        <td class="${difClasse(l.sacasEntradas - l.sacasPrevistasNoEntrado, 0.5)}">${fmt.n(l.sacasEntradas - l.sacasPrevistasNoEntrado, 1)}</td>` : ''}
      </tr>`).join('')}</tbody>
      ${comSacas ? `<tfoot><tr><th>Total</th><th></th><th></th><th></th><th>${fmt.n(tot, 1)}</th><th></th><th></th></tr></tfoot>` : ''}
    </table></div>
    ${comSacas ? '<div class="legenda-calc">* Sacas esperadas = volume que entrou × % da amostra. Mostra quantas sacas de cada peneira deveriam ter entrado se os lotes seguissem a amostra.</div>' : ''}`;
  }

  // ---------- Abas ----------
  function abaGeral(d) {
    const k = d.kpis;
    return `
      <div class="kpis">
        <div class="kpi"><div class="t">Contratos comparáveis</div><div class="v">${fmt.n(k.contratosComparaveis)}</div><div class="d">com amostra e com entrada</div></div>
        <div class="kpi"><div class="t">Volume contratado</div><div class="v">${fmt.n(k.volumeContratado)}</div><div class="d">sacas</div></div>
        <div class="kpi"><div class="t">Volume entrado</div><div class="v">${fmt.n(k.volumeEntrado)}</div><div class="d">${fmt.n(k.lotes)} lotes</div></div>
        <div class="kpi"><div class="t">Aderência à amostra</div><div class="v">${k.aderencia === null ? '–' : fmt.pct(k.aderencia)}</div><div class="d">% do volume dentro do padrão</div></div>
        <div class="kpi"><div class="t">Sem entrada / sem amostra</div><div class="v">${fmt.n(k.contratosSemEntrada)} / ${fmt.n(k.contratosSemAmostra)}</div><div class="d">contratos</div></div>
      </div>
      ${d.geral.length ? `<div class="grade">
        <div class="card"><h2>Amostra x Entrada por peneira</h2><p class="sub">% de cada peneira (entrada ponderada pelo volume dos lotes)</p><div class="grafico"><canvas id="g-geral"></canvas></div></div>
        <div class="card"><h2>Diferença por peneira</h2><p class="sub">Verde: entrou mais que a amostra · Vermelho: entrou menos</p><div class="grafico"><canvas id="g-geral-dif"></canvas></div></div>
        <div class="card full"><h2>Detalhe por peneira</h2>${tabelaPeneiras(d.geral)}</div>
      </div>` : '<div class="card vazio">Nenhum contrato com amostra e entrada nesse filtro.</div>'}`;
  }

  function abaFornecedor(d) {
    const lista = d.fornecedores.filter((f) => f.aderencia !== null);
    if (!estado.fornecedor || !d.fornecedores.find((f) => f.fornecedor === estado.fornecedor)) estado.fornecedor = d.fornecedores[0]?.fornecedor || null;
    const sel = d.fornecedores.find((f) => f.fornecedor === estado.fornecedor);
    if (!d.fornecedores.length) return '<div class="card vazio">Nenhum fornecedor nesse filtro.</div>';
    return `<div class="grade">
      <div class="card"><h2>Aderência por fornecedor</h2><p class="sub">Quanto do volume entregue ficou no padrão da amostra</p>
        <div class="grafico ${lista.length > 8 ? 'alto' : ''}"><canvas id="g-forn"></canvas></div></div>
      <div class="card"><h2>Fornecedores</h2><p class="sub">Toque numa linha para ver o detalhe</p>
        <div class="tabela"><table><thead><tr><th>Fornecedor</th><th>Contratos</th><th>Contratado</th><th>Entrado</th><th>Aderência</th></tr></thead>
        <tbody>${d.fornecedores.map((f) => `<tr class="click ${f.fornecedor === estado.fornecedor ? 'sel' : ''}" data-forn="${esc(f.fornecedor)}">
          <td>${esc(f.fornecedor)}</td><td>${f.contratos}</td><td>${fmt.n(f.quantidade)}</td><td>${fmt.n(f.volumeEntrado)}</td><td>${aderenciaPill(f.aderencia)}</td></tr>`).join('')}</tbody></table></div></div>
      ${sel ? `<div class="card"><h2>${esc(sel.fornecedor)}</h2><p class="sub">Amostra ponderada pela quantidade contratada · entrada ponderada pelo volume</p><div class="grafico"><canvas id="g-forn-sel"></canvas></div></div>
      <div class="card"><h2>Peneiras · ${esc(sel.fornecedor)}</h2>${tabelaPeneiras(sel.peneiras)}</div>` : ''}
    </div>`;
  }

  function abaContrato(d) {
    const b = estado.busca.toLowerCase();
    const lista = d.contratos.filter((c) => !b || c.contrato.toLowerCase().includes(b) || c.fornecedor.toLowerCase().includes(b) || (c.amostras || '').toLowerCase().includes(b));
    const det = d.detalhe;
    const pens = det ? det.peneiras.map((p) => p.peneira) : [];
    return `<div class="grade">
      <div class="card ${det ? '' : 'full'}"><h2>Contratos</h2><p class="sub">${fmt.n(lista.length)} contratos · toque para detalhar</p>
        <input class="busca" id="cmp-busca" placeholder="Buscar contrato, fornecedor ou amostra" value="${esc(estado.busca)}">
        <div class="tabela lista-contratos"><table><thead><tr><th>Contrato</th><th class="esq">Fornecedor</th><th>Data</th><th>Qtde</th><th>Entrado</th><th>Lotes</th><th>Aderência</th></tr></thead>
        <tbody>${lista.map((c) => `<tr class="click ${c.contrato === estado.contrato ? 'sel' : ''}" data-contrato="${esc(c.contrato)}">
          <td>${esc(c.contrato)}</td><td class="esq">${esc(c.fornecedor)}</td><td>${fmt.data(c.dataContrato)}</td><td>${fmt.n(c.quantidade)}</td>
          <td>${fmt.n(c.volumeEntrado)}</td><td>${c.nLotes}</td><td>${c.nAmostras ? aderenciaPill(c.aderencia) : '<span class="pill">sem amostra</span>'}</td></tr>`).join('')}</tbody></table></div></div>
      ${det ? `
      <div class="card"><h2>${esc(det.contrato)} · ${esc(det.fornecedor)}</h2>
        <p class="sub">Contrato de ${fmt.data(det.dataContrato)} · Amostra(s): ${esc(det.amostras || 'nenhuma')}</p>
        <div class="kpis mini">
          <div class="kpi"><div class="t">Contratado</div><div class="v">${fmt.n(det.quantidade)}</div></div>
          <div class="kpi"><div class="t">Entrado</div><div class="v">${fmt.n(det.volumeEntrado, 1)}</div><div class="d">${det.nLotes} lotes</div></div>
          <div class="kpi"><div class="t">Saldo</div><div class="v">${fmt.n(det.saldo, 1)}</div></div>
          <div class="kpi"><div class="t">Aderência</div><div class="v">${det.aderencia === null ? '–' : fmt.pct(det.aderencia)}</div></div>
        </div>
        <div class="grafico"><canvas id="g-contrato"></canvas></div></div>
      <div class="card"><h2>Peneiras do contrato</h2>
        <div class="tabela"><table><thead><tr><th>Peneira</th><th>Amostra</th><th>Entrada</th><th>Diferença</th><th>Sacas contrato*</th><th>Sacas entradas</th><th>Saldo a entrar</th></tr></thead>
        <tbody>${det.peneiras.map((l) => `<tr><td>${esc(l.peneira)}</td><td>${fmt.pct(l.amostra)}</td><td>${fmt.pct(l.entrada)}</td>
          <td class="${difClasse(l.diferenca)}">${fmt.pp(l.diferenca)}</td><td>${fmt.n(l.sacasPrevistas, 1)}</td><td>${fmt.n(l.sacasEntradas, 1)}</td>
          <td>${fmt.n(l.sacasPrevistas - l.sacasEntradas, 1)}</td></tr>`).join('')}</tbody></table></div>
        <div class="legenda-calc">* Sacas contrato = quantidade do contrato × % da amostra.</div></div>
      <div class="card"><h2>Aderência de cada lote</h2><p class="sub">Comparando a classificação do lote com a amostra do contrato</p>
        <div class="grafico ${det.lotes.length > 8 ? 'alto' : ''}"><canvas id="g-lotes"></canvas></div></div>
      <div class="card full"><h2>Lotes de entrada</h2>
        <div class="tabela"><table><thead><tr><th>Lote</th><th>Data</th><th>Sacas</th>${pens.map((p) => `<th>${esc(p)}</th>`).join('')}<th>Aderência</th></tr></thead>
        <tbody>
          <tr style="background:#eef3f9"><td><b>Amostra</b></td><td></td><td></td>${pens.map((p) => `<td><b>${fmt.pct(det.peneiras.find((x) => x.peneira === p).amostra)}</b></td>`).join('')}<td></td></tr>
          ${det.lotes.map((l) => `<tr><td>${esc(l.lote)}${l.somaOriginal !== 100 ? ` <span class="pill medio" title="Classificação original somava ${fmt.n(l.somaOriginal, 1)}% e foi ajustada para 100%">${fmt.n(l.somaOriginal)}%</span>` : ''}</td>
          <td>${fmt.data(l.data)}</td><td>${fmt.n(l.volume, 1)}</td>${pens.map((p) => `<td>${l.pct[p] ? fmt.pct(l.pct[p]) : '–'}</td>`).join('')}
          <td>${aderenciaPill(l.divergencia === null ? null : 100 - l.divergencia)}</td></tr>`).join('')}
        </tbody></table></div></div>` : ''}
    </div>`;
  }

  function desenhar() {
    const d = estado.dados;
    const area = document.getElementById('cmp-area');
    document.querySelectorAll('#cmp-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === estado.aba));
    if (estado.aba === 'geral') {
      area.innerHTML = abaGeral(d);
      if (d.geral.length) { graficoComparativo('g-geral', d.geral); graficoDiferenca('g-geral-dif', d.geral); }
    } else if (estado.aba === 'fornecedor') {
      area.innerHTML = abaFornecedor(d);
      const lista = d.fornecedores.filter((f) => f.aderencia !== null);
      if (lista.length) graficoAderencia('g-forn', lista, (f) => f.fornecedor);
      const sel = d.fornecedores.find((f) => f.fornecedor === estado.fornecedor);
      if (sel) graficoComparativo('g-forn-sel', sel.peneiras);
      area.querySelectorAll('tr[data-forn]').forEach((tr) => tr.onclick = () => { estado.fornecedor = tr.dataset.forn; desenhar(); });
    } else {
      area.innerHTML = abaContrato(d);
      if (d.detalhe) {
        graficoComparativo('g-contrato', d.detalhe.peneiras);
        const lotes = d.detalhe.lotes.filter((l) => l.divergencia !== null).map((l) => ({ ...l, aderencia: Math.round((100 - l.divergencia) * 10) / 10 }));
        if (lotes.length) graficoAderencia('g-lotes', lotes, (l) => (window.innerWidth < 600 ? l.lote : `${l.lote} (${fmt.data(l.data)})`));
      }
      const busca = document.getElementById('cmp-busca');
      busca.oninput = () => { estado.busca = busca.value; const pos = busca.selectionStart; desenhar(); const nb = document.getElementById('cmp-busca'); nb.focus(); nb.setSelectionRange(pos, pos); };
      area.querySelectorAll('tr[data-contrato]').forEach((tr) => tr.onclick = async () => {
        estado.contrato = tr.dataset.contrato;
        await carregar();
        if (window.innerWidth < 860) document.getElementById('g-contrato')?.closest('.card').scrollIntoView({ behavior: 'smooth' });
      });
    }
  }

  async function render(main) {
    main.innerHTML = `
      <h1>Classificação: Amostra de compra × Lotes de entrada</h1>
      <p class="sub" id="cmp-atualizado">Carregando...</p>
      <form class="filtros" id="cmp-filtros">
        <label>Período por<select name="base"><option value="contrato">Data do contrato</option><option value="entrada">Data de entrada do lote</option></select></label>
        <label>De<input type="date" name="de"></label>
        <label>Até<input type="date" name="ate"></label>
        <label>Fornecedor<select name="fornecedor"><option value="">Todos</option></select></label>
        <label>Armazém<select name="armazem"><option value="">Todos</option></select></label>
        <label class="check"><input type="checkbox" name="todos"> Incluir contratos sem entrada</label>
        <div style="display:flex;gap:6px"><button class="btn" type="submit">Aplicar</button><button class="btn sec" type="button" id="cmp-atualizar" title="Buscar dados novos no banco">↻</button></div>
      </form>
      <div class="abas" id="cmp-abas">
        <button data-aba="geral">Visão geral</button>
        <button data-aba="fornecedor">Por fornecedor</button>
        <button data-aba="contrato">Por contrato</button>
      </div>
      <div id="cmp-area"></div>`;

    const form = document.getElementById('cmp-filtros');
    try {
      estado.opcoes = await api('/api/comparativo/opcoes');
      form.fornecedor.innerHTML += estado.opcoes.fornecedores.map((f) => `<option>${esc(f)}</option>`).join('');
      if (estado.opcoes.armazens.length) form.armazem.innerHTML += estado.opcoes.armazens.map((a) => `<option>${esc(a)}</option>`).join('');
      else form.armazem.closest('label').style.display = 'none';
    } catch (e) { document.getElementById('cmp-area').innerHTML = `<div class="aviso">${esc(e.message)}</div>`; return; }

    for (const [k, v] of Object.entries(estado.filtros)) if (form[k]) form[k].type === 'checkbox' ? (form[k].checked = !!v) : (form[k].value = v || '');

    form.onsubmit = (ev) => {
      ev.preventDefault();
      estado.filtros = { base: form.base.value, de: form.de.value, ate: form.ate.value, fornecedor: form.fornecedor.value, armazem: form.armazem.value, todos: form.todos.checked };
      carregar();
    };
    document.getElementById('cmp-atualizar').onclick = () => carregar(true);
    document.querySelectorAll('#cmp-abas button').forEach((b) => b.onclick = () => { estado.aba = b.dataset.aba; desenhar(); });
    await carregar();
  }

  BI.registrar({ id: 'comparativo', titulo: 'Amostra × Entrada', render });
})();
