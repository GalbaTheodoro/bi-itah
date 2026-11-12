// Relatório 1: Classificação da AMOSTRA de compra x classificação dos LOTES que entraram.
//
// Regras de cálculo:
//  - Amostra: % de cada peneira da amostra do contrato (se houver mais de uma amostra, média entre elas).
//  - Entrada: % ponderado pelo volume (sacas) de cada lote:  soma(volume_lote * %peneira) / soma(volume_lote).
//    (Não se soma percentual de lotes diferentes — isso distorce o resultado.)
//  - Cada classificação é normalizada para fechar 100% (há lotes cuja classificação soma menos de 100).
//  - Diferença = % entrada - % amostra (em pontos percentuais).
//  - Divergência = metade da soma das diferenças absolutas = % do volume que entrou "fora" do padrão da amostra.
//    Aderência = 100 - divergência.

function ordemPeneira(p) {
  const m = /^#\s*(\d+)/.exec(p);
  if (m) return [0, -Number(m[1])];
  const k = p.toUpperCase();
  if (k.startsWith('MOKA')) return [1, -(Number(k.replace(/\D/g, '')) || 0)];
  if (k.startsWith('CATA')) return [2, 0];
  if (k.startsWith('FUNDO')) return [3, 0];
  return [4, 0];
}
function ordenarPeneiras(lista) {
  return [...new Set(lista)].sort((a, b) => {
    const x = ordemPeneira(a), y = ordemPeneira(b);
    return x[0] - y[0] || x[1] - y[1] || a.localeCompare(b);
  });
}

const r2 = (n) => Math.round(n * 100) / 100;

function normalizar(mapa) {
  const tot = Object.values(mapa).reduce((s, v) => s + v, 0);
  const out = {};
  if (tot > 0) for (const [k, v] of Object.entries(mapa)) out[k] = (v / tot) * 100;
  return { pct: out, total: tot };
}

function divergencia(a, e) {
  const pens = new Set([...Object.keys(a), ...Object.keys(e)]);
  let s = 0;
  for (const p of pens) s += Math.abs((e[p] || 0) - (a[p] || 0));
  return s / 2;
}

function filtrar(dados, f) {
  const de = f.de || '0000-00-00';
  const ate = f.ate || '9999-99-99';
  const noPeriodo = (d) => d && d >= de && d <= ate;
  let { amostras, entradas } = dados;

  if (f.fornecedor) {
    amostras = amostras.filter((r) => r.fornecedor === f.fornecedor);
    entradas = entradas.filter((r) => r.fornecedor === f.fornecedor);
  }
  if (f.armazem) entradas = entradas.filter((r) => r.armazem === f.armazem);

  if (f.base === 'entrada') {
    entradas = entradas.filter((r) => noPeriodo(r.dataEntrada));
    const cs = new Set(entradas.map((r) => r.contrato));
    amostras = amostras.filter((r) => cs.has(r.contrato));
  } else {
    amostras = amostras.filter((r) => noPeriodo(r.dataContrato));
    entradas = entradas.filter((r) => noPeriodo(r.dataContrato));
  }
  return { amostras, entradas };
}

function montarContratos({ amostras, entradas }) {
  const contratos = new Map();
  const pegar = (r) => {
    if (!contratos.has(r.contrato)) {
      contratos.set(r.contrato, {
        contrato: r.contrato, fornecedor: r.fornecedor, quantidade: r.quantidade, dataContrato: r.dataContrato,
        _amostras: new Map(), _lotes: new Map(),
      });
    }
    return contratos.get(r.contrato);
  };

  for (const r of amostras) {
    const c = pegar(r);
    if (!c._amostras.has(r.amostra)) c._amostras.set(r.amostra, { amostra: r.amostra, data: r.dataAmostra, pen: {} });
    const a = c._amostras.get(r.amostra);
    a.pen[r.peneira] = (a.pen[r.peneira] || 0) + r.percentual;
  }
  for (const r of entradas) {
    const c = pegar(r);
    if (!c._lotes.has(r.lote)) c._lotes.set(r.lote, { lote: r.lote, data: r.dataEntrada, volume: r.volume, armazem: r.armazem, pen: {} });
    const l = c._lotes.get(r.lote);
    l.pen[r.peneira] = (l.pen[r.peneira] || 0) + r.percentual;
  }

  for (const c of contratos.values()) {
    // Amostra
    const amostrasLista = [...c._amostras.values()].map((a) => {
      const n = normalizar(a.pen);
      return { amostra: a.amostra, data: a.data, somaOriginal: r2(n.total), pct: n.pct };
    });
    const pa = {};
    for (const a of amostrasLista) for (const [p, v] of Object.entries(a.pct)) pa[p] = (pa[p] || 0) + v / amostrasLista.length;

    // Entradas
    const lotesLista = [...c._lotes.values()].map((l) => {
      const n = normalizar(l.pen);
      return { lote: l.lote, data: l.data, volume: l.volume, armazem: l.armazem, somaOriginal: r2(n.total), pct: n.pct };
    }).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const sacas = {};
    let volume = 0;
    for (const l of lotesLista) {
      volume += l.volume;
      for (const [p, v] of Object.entries(l.pct)) sacas[p] = (sacas[p] || 0) + (l.volume * v) / 100;
    }
    const pe = {};
    if (volume > 0) for (const [p, s] of Object.entries(sacas)) pe[p] = (s / volume) * 100;

    c.amostras = amostrasLista;
    c.lotes = lotesLista;
    c.pctAmostra = pa;
    c.pctEntrada = pe;
    c.sacasEntrada = sacas;
    c.volumeEntrado = volume;
    c.temAmostra = amostrasLista.length > 0;
    c.temEntrada = lotesLista.length > 0;
    c.divergencia = c.temAmostra && c.temEntrada ? divergencia(pa, pe) : null;
    delete c._amostras; delete c._lotes;
  }
  return [...contratos.values()];
}

function linhasPeneira(pa, pe, extra = {}) {
  const pens = ordenarPeneiras([...Object.keys(pa), ...Object.keys(pe)]);
  const temA = Object.keys(pa).length > 0, temE = Object.keys(pe).length > 0;
  return pens.map((p) => {
    const a = pa[p] || 0, e = pe[p] || 0;
    const linha = { peneira: p, amostra: temA ? r2(a) : null, entrada: temE ? r2(e) : null, diferenca: temA && temE ? r2(e - a) : null };
    if (extra.quantidade !== undefined) linha.sacasPrevistas = r2((extra.quantidade * a) / 100);
    if (extra.sacas) linha.sacasEntradas = r2(extra.sacas[p] || 0);
    if (extra.volume !== undefined) linha.sacasPrevistasNoEntrado = r2((extra.volume * a) / 100);
    return linha;
  });
}

// Agrega vários contratos: amostra ponderada pela quantidade contratada, entrada ponderada pelo volume entrado.
function agregar(lista) {
  let qtd = 0, vol = 0;
  const pa = {}, sacas = {};
  for (const c of lista) {
    if (c.temAmostra) {
      qtd += c.quantidade;
      for (const [p, v] of Object.entries(c.pctAmostra)) pa[p] = (pa[p] || 0) + c.quantidade * v;
    }
    vol += c.volumeEntrado;
    for (const [p, s] of Object.entries(c.sacasEntrada)) sacas[p] = (sacas[p] || 0) + s;
  }
  const pctA = {}, pctE = {};
  if (qtd > 0) for (const [p, v] of Object.entries(pa)) pctA[p] = v / qtd;
  if (vol > 0) for (const [p, s] of Object.entries(sacas)) pctE[p] = (s / vol) * 100;
  return { quantidade: qtd, volume: vol, pctA, pctE, sacas };
}

function resumoContrato(c) {
  return {
    contrato: c.contrato, fornecedor: c.fornecedor, dataContrato: c.dataContrato,
    quantidade: r2(c.quantidade), volumeEntrado: r2(c.volumeEntrado),
    saldo: r2(c.quantidade - c.volumeEntrado),
    nLotes: c.lotes.length, nAmostras: c.amostras.length,
    amostras: c.amostras.map((a) => a.amostra).join(', '),
    divergencia: c.divergencia === null ? null : r2(c.divergencia),
    aderencia: c.divergencia === null ? null : r2(100 - c.divergencia),
  };
}

function opcoes(dados) {
  const fornecedores = [...new Set([...dados.amostras, ...dados.entradas].map((r) => r.fornecedor))].sort();
  const armazens = [...new Set(dados.entradas.map((r) => r.armazem).filter(Boolean))].sort();
  const datas = [...dados.amostras.map((r) => r.dataContrato), ...dados.entradas.map((r) => r.dataEntrada)].filter(Boolean).sort();
  return { fornecedores, armazens, dataMin: datas[0] || null, dataMax: datas[datas.length - 1] || null };
}

function gerar(dados, f) {
  const filtrados = filtrar(dados, f);
  let contratos = montarContratos(filtrados);
  const comparaveis = contratos.filter((c) => c.temAmostra && c.temEntrada);
  const baseAgregado = f.somenteComEntrada === false ? contratos : comparaveis;

  // Visão geral
  const g = agregar(baseAgregado);
  const divGeral = Object.keys(g.pctA).length && Object.keys(g.pctE).length ? divergencia(g.pctA, g.pctE) : null;

  // Por fornecedor
  const porForn = new Map();
  for (const c of baseAgregado) {
    if (!porForn.has(c.fornecedor)) porForn.set(c.fornecedor, []);
    porForn.get(c.fornecedor).push(c);
  }
  const fornecedores = [...porForn.entries()].map(([nome, lista]) => {
    const a = agregar(lista);
    const div = Object.keys(a.pctA).length && Object.keys(a.pctE).length ? divergencia(a.pctA, a.pctE) : null;
    return {
      fornecedor: nome, contratos: lista.length,
      quantidade: r2(a.quantidade), volumeEntrado: r2(a.volume),
      divergencia: div === null ? null : r2(div), aderencia: div === null ? null : r2(100 - div),
      peneiras: linhasPeneira(a.pctA, a.pctE, { sacas: a.sacas, volume: a.volume }),
    };
  }).sort((x, y) => y.volumeEntrado - x.volumeEntrado);

  // Detalhe de um contrato
  let detalhe = null;
  if (f.contrato) {
    const c = contratos.find((x) => x.contrato === f.contrato);
    if (c) {
      detalhe = {
        ...resumoContrato(c),
        peneiras: linhasPeneira(c.pctAmostra, c.pctEntrada, { quantidade: c.quantidade, sacas: c.sacasEntrada, volume: c.volumeEntrado }),
        lotes: c.lotes.map((l) => ({
          lote: l.lote, data: l.data, volume: r2(l.volume), armazem: l.armazem, somaOriginal: l.somaOriginal,
          divergencia: c.temAmostra ? r2(divergencia(c.pctAmostra, l.pct)) : null,
          pct: Object.fromEntries(Object.entries(l.pct).map(([k, v]) => [k, r2(v)])),
        })),
        amostrasDetalhe: c.amostras.map((a) => ({ ...a, pct: Object.fromEntries(Object.entries(a.pct).map(([k, v]) => [k, r2(v)])) })),
      };
    }
  }

  const volContratado = baseAgregado.reduce((s, c) => s + c.quantidade, 0);
  return {
    filtros: f,
    kpis: {
      contratos: contratos.length,
      contratosComparaveis: comparaveis.length,
      contratosSemEntrada: contratos.filter((c) => c.temAmostra && !c.temEntrada).length,
      contratosSemAmostra: contratos.filter((c) => !c.temAmostra && c.temEntrada).length,
      lotes: baseAgregado.reduce((s, c) => s + c.lotes.length, 0),
      volumeContratado: r2(volContratado),
      volumeEntrado: r2(g.volume),
      divergencia: divGeral === null ? null : r2(divGeral),
      aderencia: divGeral === null ? null : r2(100 - divGeral),
    },
    geral: linhasPeneira(g.pctA, g.pctE, { sacas: g.sacas, volume: g.volume }),
    fornecedores,
    contratos: contratos.map(resumoContrato).sort((a, b) => (b.dataContrato || '').localeCompare(a.dataContrato || '')),
    detalhe,
  };
}

module.exports = { gerar, opcoes, ordenarPeneiras, divergencia };
