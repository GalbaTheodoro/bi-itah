// Relatório: Rastreabilidade de lote (a mesma do WMS Node: procedure dbo.Node_RastreabilidadeLote)
// Volta = de onde veio (até as guias de entrada e o produtor) · Ida = para onde foi (transferências, serviços, embarques)
(() => {
  const { api, fmt, esc } = BI;
  const estado = { lote: null, sentido: 'A', visao: 'agrupado', dados: null };
  const NOMES_MOV = { LOTE: 'Lote', ENTRADA: 'Guia de entrada', TRANSFERENCIA: 'Transferência', SERVICO: 'Guia de serviço', EMBARQUE: 'Embarque' };

  const dt = (v) => (v ? fmt.data(String(v).slice(0, 10)) : '–');
  const n2 = (v) => (v === null || v === undefined || v === '' ? '–' : fmt.n(Number(v), 2));
  const pc = (v) => (v === null || v === undefined || v === '' ? '–' : fmt.pct(Number(v), 2));
  const tx = (v) => (v === null || v === undefined || v === '' ? '–' : esc(v));

  // estilos próprios da tela (uma vez)
  if (!document.getElementById('estilo-rastro')) {
    const st = document.createElement('style');
    st.id = 'estilo-rastro';
    st.textContent = `
      .ra-busca { position: relative; }
      .ra-lista { position: absolute; z-index: 30; left: 0; right: 0; top: 100%; background: #fff; border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); max-height: 320px; overflow: auto; margin-top: 2px; }
      .ra-lista button { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 8px 10px; cursor: pointer; border-bottom: 1px solid var(--line); }
      .ra-lista button:hover, .ra-lista button.ativo { background: #eef4fd; }
      .ra-lista .d { display: block; font-size: 12px; color: var(--muted); }
      .mov { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; margin-right: 6px; vertical-align: middle; }
      .mov-LOTE { background: #efe4d2; color: #7a5420; } .mov-ENTRADA { background: #dcebdf; color: #2f6640; }
      .mov-TRANSFERENCIA { background: #dfe7f3; color: #2f4f80; } .mov-SERVICO { background: #f3e6d6; color: #8a5a1c; }
      .mov-EMBARQUE { background: #f1dcd9; color: #8e3328; }
      .ra-tab td, .ra-tab th { vertical-align: top; }
      .ra-tab tr.raiz td { background: #f6efe4; font-weight: 600; }
      .ra-tab .doc { font-weight: 600; }
      .ra-tab .contrato { display: block; font-size: 11.5px; color: #2f6640; font-weight: 600; margin-top: 2px; }
      .ra-tab .prod { white-space: normal; min-width: 170px; max-width: 300px; text-align: left; }
      .ra-tab .prod .dom, .ra-tab .prod .para { display: block; font-size: 11.5px; color: var(--muted); }
      .ra-tab .vindo { white-space: normal; max-width: 260px; color: var(--muted); font-size: 12px; text-align: left; }
      .ra-tab .ciclo { color: var(--neg); font-size: 11px; margin-left: 6px; }
      .ra-tab .semlote { color: var(--muted); font-style: italic; }
      .ra-tab .abre { border: 0; background: none; cursor: pointer; width: 20px; color: var(--muted); padding: 0; }
      .ra-tab .abre.vazio { visibility: hidden; }
      .ra-tab tr.escondida { display: none; }
      @media print { .ra-tab tr.escondida { display: table-row; } .ra-tab .abre { display: none; } }
    `;
    document.head.appendChild(st);
  }

  // ---------- escolha do lote ----------
  function ligarBusca() {
    const inp = document.getElementById('ra-lote'), lista = document.getElementById('ra-lista');
    let t = null, itens = [], ativo = -1, seq = 0;
    const fechar = () => { lista.hidden = true; ativo = -1; };
    const escolher = (l) => { estado.lote = l; inp.value = l.numero; fechar(); rastrear(); };
    const desenharLista = () => {
      lista.innerHTML = itens.length ? itens.map((l, i) => `<button type="button" data-i="${i}" class="${i === ativo ? 'ativo' : ''}"><b>${esc(l.numero)}</b>
        <span class="d">${dt(l.data)} · volume inicial ${n2(l.volumeInicial)} · saldo ${n2(l.saldo)}</span></button>`).join('')
        : '<div class="sub" style="padding:8px 10px">Nenhum lote com esse número.</div>';
      lista.hidden = false;
      lista.querySelectorAll('button').forEach((b) => b.onmousedown = (ev) => { ev.preventDefault(); escolher(itens[Number(b.dataset.i)]); });
    };
    inp.oninput = () => {
      estado.lote = null;
      clearTimeout(t);
      const q = inp.value.trim();
      if (!q) { fechar(); return; }
      t = setTimeout(async () => {
        const meu = ++seq;
        try { const r = await api('/api/rastreabilidade/lotes?q=' + encodeURIComponent(q)); if (meu !== seq) return; itens = r; ativo = -1; desenharLista(); } catch (e) { mostrarErro(e.message); }
      }, 250);
    };
    inp.onkeydown = (ev) => {
      if (lista.hidden || !itens.length) { if (ev.key === 'Enter') { ev.preventDefault(); rastrear(); } return; }
      if (ev.key === 'ArrowDown') { ativo = Math.min(itens.length - 1, ativo + 1); desenharLista(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { ativo = Math.max(0, ativo - 1); desenharLista(); ev.preventDefault(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); escolher(itens[ativo >= 0 ? ativo : 0]); }
      else if (ev.key === 'Escape') fechar();
    };
    inp.onblur = () => setTimeout(fechar, 150);
  }

  function mostrarErro(m) {
    const el = document.getElementById('ra-erro');
    el.innerHTML = m ? `<div class="aviso">${esc(m)}</div>` : '';
  }

  async function rastrear() {
    const numero = document.getElementById('ra-lote').value.trim();
    if (!estado.lote && !numero) { mostrarErro('Digite o número do lote e escolha na lista.'); return; }
    mostrarErro('');
    const area = document.getElementById('ra-area'), btn = document.getElementById('ra-btn');
    area.classList.add('carregando'); btn.disabled = true; btn.textContent = 'Rastreando...';
    try {
      const p = new URLSearchParams({ sentido: estado.sentido });
      if (estado.lote) p.set('idlote', estado.lote.id); else p.set('numero', numero);
      estado.dados = await api('/api/rastreabilidade?' + p.toString());
      desenhar();
    } catch (e) { area.innerHTML = ''; mostrarErro(e.message); } finally { area.classList.remove('carregando'); btn.disabled = false; btn.textContent = 'Rastrear'; }
  }

  // ---------- desenho ----------
  function produtorDe(l) {
    if (!l.Produtor && !l.Domicilio && !l.ProdutorNovo && !l.DomicilioNovo) return '–';
    let h = esc(l.Produtor || l.Domicilio) + (l.Domicilio && l.Produtor ? `<span class="dom">${esc(l.Domicilio)}</span>` : '');
    if (l.Movimento === 'TRANSFERENCIA' && (l.ProdutorNovo || l.DomicilioNovo) && String(l.IDDomicilioNovo) !== String(l.IDDomicilio)) {
      h += `<span class="para">→ ${esc(l.ProdutorNovo || l.DomicilioNovo)}${l.DomicilioNovo && l.ProdutorNovo ? ' · ' + esc(l.DomicilioNovo) : ''}</span>`;
    }
    return h;
  }
  const contratoDe = (l) => (l.Movimento === 'ENTRADA' ? `<span class="contrato">Contrato de compra ${l.Contrato ? esc(l.Contrato) : '–'}</span>` : '');
  const movDe = (l, raiz) => (raiz ? '<span class="mov mov-LOTE">Lote pesquisado</span>'
    : `<span class="mov mov-${esc(l.Movimento)}">${NOMES_MOV[l.Movimento] || esc(l.Movimento)}</span><span class="doc">${tx(l.Documento)}</span>${contratoDe(l)}`);
  function loteDe(l) {
    if (l.Lote) return esc(l.Lote) + (l.Ciclo ? '<span class="ciclo" title="Este lote volta a aparecer num caminho que já passou por ele">(repetido)</span>' : '');
    return l.Movimento === 'SERVICO' ? '<span class="semlote">sem lote resultado ainda</span>' : '–';
  }
  // tipo de produto (peneira), padrão e bebida do lote da linha
  const infoTh = '<th class="esq">Tipo (peneira)</th><th class="esq">Padrão</th><th class="esq">Bebida</th>';
  const infoTd = (l, raiz) => `<td class="esq">${tx(l.Tipo)}</td><td class="esq">${tx(l.Padrao)}</td><td class="esq">${tx(l.Bebida)}</td>`;
  const vazio = (s) => `<div class="vazio" style="padding:10px 0">${s === 'V' ? 'Nenhuma origem encontrada para este lote.' : 'Este lote ainda não foi transferido, usado em serviço nem embarcado.'}</div>`;
  const soma = (ls, mov) => ls.filter((l) => l.Movimento === mov).reduce((s, l) => s + Number(l.VolumeRastreado || 0), 0);

  function tabelaAgrupada(ls, s) {
    if (ls.length <= 1) return vazio(s);
    const ida = s === 'I';
    return `<div class="tabela"><table class="ra-tab"><thead><tr><th class="esq">Movimento / guia</th><th>Data</th><th>${ida ? 'Lote gerado' : 'Lote de origem'}</th>${infoTh}<th class="esq">Produtor / domicílio</th>
      <th class="esq">${ida ? 'Vindo do lote' : 'Usado para formar'}</th><th>Volume do movimento</th><th>% do lote pesquisado</th><th>Volume rastreado</th>${ida ? '<th>Saldo do lote</th><th>Saldo rastreado</th>' : ''}<th>Caminhos</th></tr></thead>
      <tbody>${ls.map((l) => { const raiz = l.Movimento === 'LOTE' && l.Nivel === 0; return `<tr class="${raiz ? 'raiz' : ''}">
        <td class="esq">${movDe(l, raiz)}</td><td>${dt(l.DataDocumento)}</td><td>${loteDe(l)}</td>${infoTd(l, raiz)}<td class="prod">${raiz ? '' : produtorDe(l)}</td>
        <td class="vindo">${raiz ? '' : tx(l.LotesAnteriores)}</td><td>${n2(l.VolumeMovimento)}</td><td>${raiz ? '100,00%' : pc(l.FracaoPct)}</td><td>${n2(l.VolumeRastreado)}</td>
        ${ida ? `<td>${n2(l.SaldoLote)}</td><td>${n2(l.SaldoRastreado)}</td>` : ''}<td>${raiz ? '' : l.Caminhos > 1 ? l.Caminhos + ' caminhos' : '1'}</td></tr>`; }).join('')}</tbody>
      <tfoot><tr><th class="esq" colspan="10">${ida ? 'Total embarcado' : 'Total vindo de guias de entrada'}</th><th>${n2(soma(ls, ida ? 'EMBARQUE' : 'ENTRADA'))}</th>${ida ? '<th></th><th></th>' : ''}<th></th></tr></tfoot></table></div>
      <div class="legenda-calc">Mesma guia e mesmo lote alcançados por mais de um caminho aparecem numa linha só, com os volumes somados. Para ver cada caminho, use "Caminho completo (árvore)".</div>`;
  }

  function tabelaArvore(ls, s) {
    if (ls.length <= 1) return vazio(s);
    const ida = s === 'I';
    const temFilhos = new Set(ls.map((l) => l.SeqPai).filter((x) => x !== null && x !== undefined));
    return `<div class="tabela"><table class="ra-tab"><thead><tr><th class="esq">Caminho</th><th>Data</th><th>${ida ? 'Lote gerado' : 'Lote de origem'}</th>${infoTh}<th class="esq">Produtor / domicílio</th>
      <th>Volume do movimento</th><th>Participação na guia</th><th>% do lote pesquisado</th><th>Volume rastreado</th>${ida ? '<th>Saldo do lote</th><th>Saldo rastreado</th>' : ''}</tr></thead>
      <tbody>${ls.map((l) => { const raiz = l.Nivel === 0;
        const abre = temFilhos.has(l.Seq) ? `<button type="button" class="abre" data-seq="${l.Seq}" aria-expanded="true" title="Abrir / fechar">▾</button>` : '<span class="abre vazio">▾</span>';
        const part = l.Movimento === 'SERVICO' && l.ProporcaoPct !== null && l.ProporcaoPct !== undefined
          ? `${pc(l.ProporcaoPct)} <span class="sub">(${n2(l.VolumeEntradaGuia)} de ${n2(l.TotalEntradaGuia)})</span>` : '–';
        return `<tr class="${raiz ? 'raiz' : ''}" data-seq="${l.Seq}" data-pai="${l.SeqPai ?? ''}">
          <td class="esq"><span style="display:inline-block;width:${l.Nivel * 22}px"></span>${abre}${movDe(l, raiz)}</td><td>${dt(l.DataDocumento)}</td><td>${loteDe(l)}</td>${infoTd(l, raiz)}
          <td class="prod">${raiz ? '' : produtorDe(l)}</td><td>${n2(l.VolumeMovimento)}</td><td>${part}</td><td>${raiz ? '100,00%' : pc(l.FracaoPct)}</td><td>${n2(l.VolumeRastreado)}</td>
          ${ida ? `<td>${n2(l.SaldoLote)}</td><td>${n2(l.SaldoRastreado)}</td>` : ''}</tr>`; }).join('')}</tbody>
      <tfoot><tr><th class="esq" colspan="10">${ida ? 'Total embarcado' : 'Total vindo de guias de entrada'}</th><th>${n2(soma(ls, ida ? 'EMBARQUE' : 'ENTRADA'))}</th>${ida ? '<th></th><th></th>' : ''}</tr></tfoot></table></div>`;
  }

  // abre/fecha os ramos da árvore
  function ligarArvore(area) {
    area.querySelectorAll('.ra-tab .abre[data-seq]').forEach((b) => b.onclick = () => {
      const aberto = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', aberto ? 'false' : 'true');
      b.textContent = aberto ? '▸' : '▾';
      const tabela = b.closest('table');
      const esconder = (pai, sim) => tabela.querySelectorAll(`tr[data-pai="${pai}"]`).forEach((tr) => {
        tr.classList.toggle('escondida', sim);
        const fb = tr.querySelector('.abre[data-seq]');
        // ao abrir, só reabre os filhos que estavam abertos
        if (!sim && fb && fb.getAttribute('aria-expanded') === 'false') return;
        esconder(tr.dataset.seq, sim);
      });
      esconder(b.dataset.seq, aberto);
    });
  }

  function tabelaOrigem(origem, lote) {
    if (!origem.length) return '<div class="vazio" style="padding:10px 0">Nenhuma guia de entrada encontrada na origem deste lote.</div>';
    const total = (c) => origem.reduce((s, o) => s + Number(o[c] || 0), 0);
    const prodCel = (o) => esc(o.Produtor || o.Domicilio || '–') + (o.Produtor && o.Domicilio ? `<span class="dom">${esc(o.Domicilio)}</span>` : '');
    const mapa = new Map();
    for (const o of origem) {
      const k = o.IDDomicilio ?? 'sem:' + (o.Produtor || '');
      const g = mapa.get(k) || { Produtor: o.Produtor, Domicilio: o.Domicilio, guias: [], contratos: [], Pct: 0, Vol: 0, Saldo: 0 };
      g.guias.push(o.Guia); if (o.Contrato) g.contratos.push(...String(o.Contrato).split(', ')); g.Pct += Number(o.PctDoLote || 0); g.Vol += Number(o.VolumeOrigem || 0); g.Saldo += Number(o.VolumeNoSaldo || 0);
      mapa.set(k, g);
    }
    const prods = [...mapa.values()].sort((a, b) => b.Vol - a.Vol);
    return `<div class="tabela"><table class="ra-tab"><thead><tr><th class="esq">GR de entrada</th><th class="esq">Contrato de compra</th><th>Data</th><th class="esq">Produtor / domicílio</th><th class="esq">Desdobras</th>${infoTh}
        <th>% do lote</th><th>Volume (sobre ${n2(lote.VolumeInicial)} inicial)</th><th>No saldo atual (${n2(lote.Saldo)})</th></tr></thead>
      <tbody>${origem.map((o) => `<tr><td class="esq doc">${tx(o.Guia)}</td><td class="esq">${tx(o.Contrato)}</td><td>${dt(o.Data)}</td><td class="prod">${prodCel(o)}</td><td class="vindo">${tx(o.Desdobras)}</td>${infoTd(o)}
        <td>${pc(o.PctDoLote)}</td><td>${n2(o.VolumeOrigem)}</td><td>${n2(o.VolumeNoSaldo)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th class="esq" colspan="8">${origem.length} ${origem.length === 1 ? 'guia' : 'guias'} de entrada</th><th>${pc(Math.min(total('PctDoLote'), 100))}</th><th>${n2(total('VolumeOrigem'))}</th><th>${n2(total('VolumeNoSaldo'))}</th></tr></tfoot></table></div>
      <h3 style="font-size:14px;margin:14px 0 6px">Por produtor</h3>
      <div class="tabela"><table class="ra-tab"><thead><tr><th class="esq">Produtor / domicílio</th><th class="esq">GR de entrada</th><th class="esq">Contrato de compra</th><th>% do lote</th><th>Volume</th><th>No saldo atual</th></tr></thead>
      <tbody>${prods.map((g) => `<tr><td class="prod">${prodCel(g)}</td><td class="vindo">${esc([...new Set(g.guias)].join(', '))}</td><td class="esq">${esc([...new Set(g.contratos)].join(', ') || '–')}</td><td>${pc(Math.min(g.Pct, 100))}</td><td>${n2(g.Vol)}</td><td>${n2(g.Saldo)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th class="esq" colspan="3">${prods.length} ${prods.length === 1 ? 'produtor' : 'produtores'}</th><th>${pc(Math.min(total('PctDoLote'), 100))}</th><th>${n2(total('VolumeOrigem'))}</th><th>${n2(total('VolumeNoSaldo'))}</th></tr></tfoot></table></div>`;
  }

  function desenhar() {
    const { lote, linhas, agrupado, origem } = estado.dados, s = estado.sentido, area = document.getElementById('ra-area');
    const so = (ls, x) => (ls || []).filter((l) => l.Sentido === x);
    const mostraIda = s === 'A' || s === 'I', mostraVolta = s === 'A' || s === 'V', mostraOrigem = s !== 'I';
    const kpi = (t, v, d = '') => `<div class="kpi"><div class="t">${t}</div><div class="v">${v}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
    const tab = (ls, x) => (estado.visao === 'agrupado' ? tabelaAgrupada(so(agrupado, x), x) : tabelaArvore(so(linhas, x), x));
    area.innerHTML = `
      <div class="card" style="margin-bottom:14px"><h2>Lote ${tx(lote.Lote)}</h2><p class="sub">Data ${dt(lote.Data)} · id ${esc(lote.IDLote)} · Tipo (peneira) <b>${tx(lote.Tipo)}</b> · Padrão <b>${tx(lote.Padrao)}</b> · Bebida <b>${tx(lote.Bebida)}</b></p>
        <div class="kpis" style="margin-bottom:6px">
          ${kpi('Volume inicial', n2(lote.VolumeInicial))}${kpi('Saldo atual', n2(lote.Saldo))}
          ${mostraIda ? kpi('Embarcado', n2(lote.TotalEmbarcado || 0)) + kpi('Em estoque (todos os lotes)', n2(lote.TotalEmEstoque || 0)) + (Number(lote.TotalEmServico || 0) > 0 ? kpi('Em serviço sem resultado', n2(lote.TotalEmServico)) : '') : ''}
          ${mostraOrigem ? kpi('Origem em guias de entrada', n2(lote.TotalOrigemEntradas || 0)) + kpi('GR de entrada', fmt.n((origem || []).length)) + kpi('Produtores', fmt.n(new Set((origem || []).map((o) => o.IDDomicilio ?? o.Produtor)).size)) : ''}
        </div>
        ${estado.dados.avisoProdutor ? `<div class="aviso">${esc(estado.dados.avisoProdutor)}</div>` : ''}
        ${estado.dados.avisoInfo ? `<div class="aviso">${esc(estado.dados.avisoInfo)}</div>` : ''}
        ${estado.dados.avisoContrato ? `<div class="aviso">${esc(estado.dados.avisoContrato)}</div>` : ''}
        ${lote.Truncado ? '<div class="aviso">O caminho deste lote é muito grande e o relatório foi cortado. Os totais podem estar incompletos.</div>' : ''}
        ${s !== 'O' ? `<div class="abas" id="ra-visao" style="margin:8px 0 0"><button type="button" data-v="agrupado" class="${estado.visao === 'agrupado' ? 'ativo' : ''}">Agrupado por guia e lote</button><button type="button" data-v="arvore" class="${estado.visao === 'arvore' ? 'ativo' : ''}">Caminho completo (árvore)</button></div>` : ''}
      </div>
      <div class="grade">
        ${mostraVolta && s !== 'O' ? `<div class="card full"><h2>← De onde veio</h2><p class="sub">Do lote para trás: transferências e guias de serviço que o formaram, até as guias de entrada. "% do lote" é quanto do lote pesquisado veio de cada origem.</p>${tab(linhas, 'V')}</div>` : ''}
        ${mostraIda ? `<div class="card full"><h2>→ Para onde foi</h2><p class="sub">Do lote para frente: transferências, guias de serviço e embarques. "Volume rastreado" é quanto do lote pesquisado passou por ali; "Saldo rastreado" é o que ainda está em estoque naquele lote.</p>${tab(linhas, 'I')}</div>` : ''}
        ${mostraOrigem ? `<div class="card full"><h2>◎ Resumo de origem</h2><p class="sub">Quanto do lote pesquisado veio de cada guia de entrada (GR) e de cada produtor, já com a proporcionalidade das guias de serviço e das transferências. "No saldo atual" é essa mesma proporção aplicada ao que existe hoje no lote.</p>${tabelaOrigem(origem || [], lote)}</div>` : ''}
      </div>
      <div class="legenda-calc">Na guia de serviço vários lotes se misturam e saem vários lotes: o relatório divide pela proporção em que cada lote entrou na guia. Mesma regra do WMS (${estado.dados.fonte === 'procedure' ? 'procedure dbo.Node_RastreabilidadeLote' : 'mesma consulta da procedure dbo.Node_RastreabilidadeLote'}).</div>`;
    area.querySelectorAll('#ra-visao button').forEach((b) => b.onclick = () => { estado.visao = b.dataset.v; desenhar(); });
    if (estado.visao === 'arvore') ligarArvore(area);
  }

  async function render(main) {
    main.innerHTML = `
      <h1>Rastreabilidade de lote</h1>
      <p class="sub">Tudo por onde o lote passou: de onde veio (até a GR de entrada e o produtor) e para onde foi.</p>
      <form class="filtros" id="ra-filtros" autocomplete="off">
        <label class="ra-busca" style="grid-column: span 2">Número do lote<input id="ra-lote" placeholder="Digite parte do número e escolha" value="${esc(estado.lote?.numero || '')}"><div class="ra-lista" id="ra-lista" hidden></div></label>
        <label>Mostrar<select id="ra-sentido">
          <option value="A">De onde veio e para onde foi</option><option value="V">Só de onde veio</option>
          <option value="I">Só para onde foi</option><option value="O">Só a origem (GR de entrada e produtor)</option></select></label>
        <div style="display:flex;gap:6px"><button class="btn" type="submit" id="ra-btn">Rastrear</button></div>
      </form>
      <div id="ra-erro"></div>
      <div id="ra-area"></div>`;
    const sel = document.getElementById('ra-sentido');
    sel.value = estado.sentido;
    sel.onchange = () => { estado.sentido = sel.value; if (estado.lote || document.getElementById('ra-lote').value.trim()) rastrear(); };
    document.getElementById('ra-filtros').onsubmit = (ev) => { ev.preventDefault(); rastrear(); };
    ligarBusca();
    if (estado.dados) desenhar();
  }

  BI.registrar({ id: 'rastreabilidade', titulo: 'Rastreabilidade de lote', render });
})();
