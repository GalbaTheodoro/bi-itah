// Relatório 3: O que foi COMPRADO × o que foi VENDIDO, por peneira.
//
// Duas bases (escolha na tela):
//  - Contratado: sacas do contrato × % de cada peneira da amostra do contrato (compra e venda).
//  - Físico: lotes que ENTRARAM nos contratos de compra × lotes VINCULADOS aos contratos de venda,
//            cada lote com a sua classificação por peneira (ajustada para 100%).
// Saldo da peneira = comprado − vendido  (positivo = sobra para vender; negativo = vendeu mais do que comprou).

const r2 = (n) => Math.round(n * 100) / 100;
const { grupoPeneira, gruposTipo, ordemGrupos } = require('./gs');

// Lotes vendidos -> por contrato, sacas por TIPO DE PRODUTO do lote
function contratosPorTipo(linhas) {
  const m = new Map();
  for (const r of linhas) {
    if (!m.has(r.contrato)) m.set(r.contrato, { contrato: r.contrato, parte: r.cliente, data: r.dataContrato, quantidade: r.quantidade, lotes: new Map() });
    const c = m.get(r.contrato);
    if (!c.lotes.has(r.lote)) c.lotes.set(r.lote, { volume: r.volume, tipo: r.tipo || '(sem tipo)' });
  }
  return [...m.values()].map((c) => {
    const tipos = {};
    let volume = 0;
    for (const l of c.lotes.values()) { volume += l.volume; tipos[l.tipo] = (tipos[l.tipo] || 0) + l.volume; }
    return { contrato: c.contrato, parte: c.parte, data: c.data, quantidade: c.quantidade, volume, nLotes: c.lotes.size, tipos, semClassificacao: tipos['(sem tipo)'] || 0 };
  });
}

function ordenarPeneiras(lista) {
  const chave = (p) => {
    const m = /^#\s*(\d+)/.exec(p);
    if (m) return [0, -Number(m[1])];
    const k = p.toUpperCase();
    if (k.startsWith('MOKA')) return [1, -(Number(k.replace(/\D/g, '')) || 0)];
    if (k.startsWith('CATA')) return [2, 0];
    if (k.startsWith('FUNDO')) return [3, 0];
    return [4, 0];
  };
  return [...new Set(lista)].sort((a, b) => { const x = chave(a), y = chave(b); return x[0] - y[0] || x[1] - y[1] || a.localeCompare(b); });
}

const mes = (d) => (d ? d.slice(0, 7) : 'sem data');

// Contratos com amostra -> { contrato, parte, data, quantidade, pct{peneira} }  (média se tiver mais de uma amostra)
function contratosPorAmostra(linhas, campoParte) {
  const m = new Map();
  for (const r of linhas) {
    if (!r.peneira || !(r.percentual > 0)) continue;
    if (!m.has(r.contrato)) m.set(r.contrato, { contrato: r.contrato, parte: r[campoParte], data: r.dataContrato, quantidade: r.quantidade, amostras: new Map() });
    const c = m.get(r.contrato);
    if (!c.amostras.has(r.amostra)) c.amostras.set(r.amostra, {});
    const a = c.amostras.get(r.amostra);
    a[r.peneira] = (a[r.peneira] || 0) + r.percentual;
  }
  return [...m.values()].map((c) => {
    const pct = {};
    const lista = [...c.amostras.values()];
    for (const a of lista) {
      const tot = Object.values(a).reduce((s, v) => s + v, 0);
      for (const [p, v] of Object.entries(a)) pct[p] = (pct[p] || 0) + (v / tot) * 100 / lista.length;
    }
    const sacas = {};
    for (const [p, v] of Object.entries(pct)) sacas[p] = (c.quantidade * v) / 100;
    return { contrato: c.contrato, parte: c.parte, data: c.data, quantidade: c.quantidade, amostras: [...c.amostras.keys()].join(', '), sacas };
  });
}

// Lotes -> por contrato { contrato, parte, data, quantidade, volume, sacas{peneira}, semClassificacao }
function contratosPorLotes(linhas, campoParte, campoData) {
  const m = new Map();
  for (const r of linhas) {
    if (!m.has(r.contrato)) m.set(r.contrato, { contrato: r.contrato, parte: r[campoParte], data: r.dataContrato, quantidade: r.quantidade, lotes: new Map() });
    const c = m.get(r.contrato);
    if (!c.lotes.has(r.lote)) c.lotes.set(r.lote, { volume: r.volume, data: r[campoData], pen: {} });
    if (r.peneira && r.percentual > 0) { const l = c.lotes.get(r.lote); l.pen[r.peneira] = (l.pen[r.peneira] || 0) + r.percentual; }
  }
  return [...m.values()].map((c) => {
    const sacas = {};
    let volume = 0, semClass = 0;
    for (const l of c.lotes.values()) {
      volume += l.volume;
      const tot = Object.values(l.pen).reduce((s, v) => s + v, 0);
      if (!tot) { semClass += l.volume; continue; }
      for (const [p, v] of Object.entries(l.pen)) sacas[p] = (sacas[p] || 0) + (l.volume * v) / tot;
    }
    return { contrato: c.contrato, parte: c.parte, data: c.data, quantidade: c.quantidade, volume, semClassificacao: semClass, nLotes: c.lotes.size, sacas };
  });
}

function somar(lista) {
  const s = {};
  for (const c of lista) for (const [p, v] of Object.entries(c.sacas)) s[p] = (s[p] || 0) + v;
  return s;
}

function opcoes(compras, vendas) {
  const fornecedores = [...new Set([...compras.amostras, ...compras.entradas].map((r) => r.fornecedor))].sort();
  const clientes = [...new Set([...vendas.amostras, ...vendas.lotes].map((r) => r.cliente))].sort();
  const datas = [...compras.amostras, ...vendas.amostras].map((r) => r.dataContrato).filter(Boolean).sort();
  return { fornecedores, clientes, dataMin: datas[0] || null, dataMax: datas[datas.length - 1] || null };
}

function gerar(compras, vendas, f) {
  const de = f.de || '0000-00-00', ate = f.ate || '9999-99-99';
  const noPeriodo = (d) => !!d && d >= de && d <= ate;

  let comp, vend;
  if (f.base === 'fisico') {
    comp = contratosPorLotes(compras.entradas.map((r) => ({ ...r, dataLote: r.dataEntrada })), 'fornecedor', 'dataLote');
    vend = contratosPorLotes(vendas.lotes, 'cliente', 'dataContrato');
  } else {
    comp = contratosPorAmostra(compras.amostras, 'fornecedor');
    vend = contratosPorAmostra(vendas.amostras, 'cliente');
  }
  comp = comp.filter((c) => noPeriodo(c.data) && (!f.fornecedor || c.parte === f.fornecedor));
  vend = vend.filter((c) => noPeriodo(c.data) && (!f.cliente || c.parte === f.cliente));

  // Vendido por TIPO DE PRODUTO: os dois lados vão para os grupos de config/mapeamento-gs.json
  let tiposVendidos = null;
  let ordenar = ordenarPeneiras;
  if (f.vendaPor === 'tipo') {
    for (const c of comp) {
      const g = {};
      for (const [p, v] of Object.entries(c.sacas)) { const k = grupoPeneira(p); g[k] = (g[k] || 0) + v; }
      c.sacas = g;
    }
    const mixCompra = somar(comp);
    const tv = {};
    vend = contratosPorTipo(vendas.lotes).filter((c) => noPeriodo(c.data) && (!f.cliente || c.parte === f.cliente));
    for (const c of vend) {
      const g = {};
      for (const [t, v] of Object.entries(c.tipos)) {
        tv[t] = (tv[t] || 0) + v;
        if (t === '(sem tipo)') continue;
        const grs = gruposTipo(t);
        // tipo que cobre várias peneiras (ex.: 14/16) é dividido na proporção do que foi comprado desses grupos
        const base = grs.map((x) => mixCompra[x] || 0), tot = base.reduce((a, b) => a + b, 0);
        grs.forEach((x, i) => { g[x] = (g[x] || 0) + v * (tot > 0 ? base[i] / tot : 1 / grs.length); });
      }
      c.sacas = g;
    }
    const totTv = Object.values(tv).reduce((a, b) => a + b, 0);
    tiposVendidos = Object.entries(tv).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ tipo: t, grupos: t === '(sem tipo)' ? 'fora da conta' : gruposTipo(t).join(' + '), sacas: r2(v), pct: r2(totTv ? (v / totTv) * 100 : 0) }));
    ordenar = ordemGrupos;
  }

  const sc = somar(comp), sv = somar(vend);
  const totC = Object.values(sc).reduce((a, b) => a + b, 0);
  const totV = Object.values(sv).reduce((a, b) => a + b, 0);
  const peneiras = ordenar([...Object.keys(sc), ...Object.keys(sv)]).map((p) => ({
    peneira: p,
    comprado: r2(sc[p] || 0), pctComprado: r2(totC ? ((sc[p] || 0) / totC) * 100 : 0),
    vendido: r2(sv[p] || 0), pctVendido: r2(totV ? ((sv[p] || 0) / totV) * 100 : 0),
    saldo: r2((sc[p] || 0) - (sv[p] || 0)),
  }));

  // Por mês
  const meses = {};
  for (const [lista, campo] of [[comp, 'comprado'], [vend, 'vendido']]) {
    for (const c of lista) {
      const k = mes(c.data);
      if (!meses[k]) meses[k] = { mes: k, comprado: 0, vendido: 0, porPeneira: {} };
      const t = Object.values(c.sacas).reduce((a, b) => a + b, 0);
      meses[k][campo] += t;
      for (const [p, v] of Object.entries(c.sacas)) {
        meses[k].porPeneira[p] = meses[k].porPeneira[p] || { comprado: 0, vendido: 0 };
        meses[k].porPeneira[p][campo] += v;
      }
    }
  }
  const porMes = Object.values(meses).sort((a, b) => a.mes.localeCompare(b.mes)).map((m) => ({
    mes: m.mes, comprado: r2(m.comprado), vendido: r2(m.vendido),
    porPeneira: Object.fromEntries(Object.entries(m.porPeneira).map(([p, v]) => [p, { comprado: r2(v.comprado), vendido: r2(v.vendido) }])),
  }));

  // Por fornecedor / cliente
  const agrupar = (lista) => {
    const g = new Map();
    for (const c of lista) {
      if (!g.has(c.parte)) g.set(c.parte, { nome: c.parte, contratos: 0, sacas: {} });
      const x = g.get(c.parte); x.contratos++;
      for (const [p, v] of Object.entries(c.sacas)) x.sacas[p] = (x.sacas[p] || 0) + v;
    }
    return [...g.values()].map((x) => ({ nome: x.nome, contratos: x.contratos, total: r2(Object.values(x.sacas).reduce((a, b) => a + b, 0)), sacas: Object.fromEntries(Object.entries(x.sacas).map(([p, v]) => [p, r2(v)])) }))
      .sort((a, b) => b.total - a.total);
  };

  const listaContratos = (lista, lado) => lista.map((c) => ({
    lado, contrato: c.contrato, parte: c.parte, data: c.data, quantidade: r2(c.quantidade),
    volume: c.volume === undefined ? null : r2(c.volume), nLotes: c.nLotes ?? null, amostras: c.amostras ?? null,
    tipos: c.tipos ? Object.entries(c.tipos).map(([t, v]) => `${t}: ${r2(v)}`).join(' · ') : null,
    semClassificacao: c.semClassificacao ? r2(c.semClassificacao) : 0,
    total: r2(Object.values(c.sacas).reduce((a, b) => a + b, 0)),
    sacas: Object.fromEntries(Object.entries(c.sacas).map(([p, v]) => [p, r2(v)])),
  })).sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  return {
    filtros: f,
    kpis: {
      contratosCompra: comp.length, contratosVenda: vend.length,
      comprado: r2(totC), vendido: r2(totV), saldo: r2(totC - totV),
      semClassCompra: r2(comp.reduce((s, c) => s + (c.semClassificacao || 0), 0)),
      semClassVenda: r2(vend.reduce((s, c) => s + (c.semClassificacao || 0), 0)),
    },
    peneiras,
    tiposVendidos,
    porGrupo: f.vendaPor === 'tipo',
    porMes,
    fornecedores: agrupar(comp),
    clientes: agrupar(vend),
    contratos: [...listaContratos(comp, 'Compra'), ...listaContratos(vend, 'Venda')],
  };
}

module.exports = { gerar, opcoes };
