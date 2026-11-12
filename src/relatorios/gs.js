// Relatório 2: Café DESPEJADO na Guia de Serviço (classificação por peneira dos lotes de entrada)
//              x RESULTADO da GS (lotes de saída por tipo de produto).
//
// Como comparar peneira com tipo de produto: os dois lados são levados para os mesmos GRUPOS
// (config/mapeamento-gs.json). Ex.: #17 e #18 -> "17/18"; tipo "17/18" -> "17/18"; tipo "FDO" -> "Fundo".
//  - Despejado: % de cada grupo ponderado pelo volume de cada lote (classificação ajustada para 100%),
//    aplicado ao volume total despejado na guia = sacas ESPERADAS por grupo.
//  - Resultado: sacas de cada tipo de produto somadas por grupo.
//  - Tipos que cobrem várias peneiras (ex.: 14/16) são divididos entre os grupos na mesma
//    proporção em que esses grupos vieram no café despejado daquela guia.
//  - Resíduo/Perdas e Grinders normalmente não existem na classificação de entrada: aparecem só no resultado.
//  - Rendimento = sacas de resultado / sacas despejadas.
const fs = require('fs');
const path = require('path');

const ARQ_MAPA = path.join(__dirname, '..', '..', 'config', 'mapeamento-gs.json');
let mapa = null;
function carregarMapa() {
  if (!mapa) mapa = JSON.parse(fs.readFileSync(ARQ_MAPA, 'utf8'));
  return mapa;
}

const r2 = (n) => Math.round(n * 100) / 100;
const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function grupoNumero(n) {
  if (n >= 17) return '17/18';
  if (n === 16 || n === 15 || n === 14) return String(n);
  return '13 e menores';
}

const juntar = (g) => (carregarMapa().juntar || {})[g] || g;

function grupoPeneira(peneira) { return juntar(grupoPeneiraBase(peneira)); }
function grupoPeneiraBase(peneira) {
  const m = carregarMapa();
  if (m.peneiras[peneira]) return m.peneiras[peneira];
  const k = norm(peneira);
  for (const [p, g] of Object.entries(m.peneiras)) if (norm(p) === k) return g;
  if (/MOKA|^MK/.test(k)) return 'Moka';
  if (/CATA|ESCOLHA/.test(k)) return 'Catação/Escolha';
  if (/FUNDO|^FD/.test(k)) return 'Fundo';
  const n = /(\d{2})/.exec(k);
  if (n) return grupoNumero(Number(n[1]));
  return 'Outros';
}

// Retorna a lista de grupos que um tipo de produto cobre
const cacheTipos = new Map();
function gruposTipo(tipo) {
  if (cacheTipos.has(tipo)) return cacheTipos.get(tipo);
  const m = carregarMapa();
  const k = norm(tipo);
  let res = null;
  for (const [t, g] of Object.entries(m.tipos)) if (norm(t) === k) res = Array.isArray(g) ? g : [g];
  if (!res) {
    if (/RES(IDUO)?\b|VENTO|\bPO\b|PEDRA|IMPUREZA|RESIDUO/.test(k)) res = ['Resíduo/Perdas'];
    else if (/GRINDER/.test(k)) res = ['Grinders'];
    else {
      const grupos = new Set();
      const temMoka = /MOKA|\bMK|MK\b|\dMK/.test(k);
      const semMoka = k.replace(/MOKA|MK/g, ' ');
      // faixas tipo 14/16 ou 14/15/16; números colados tipo 1516
      const nums = (semMoka.match(/\d+/g) || []).flatMap((s) => (s.length === 4 ? [s.slice(0, 2), s.slice(2)] : [s])).map(Number).filter((n) => n >= 8 && n <= 20);
      if (nums.length) {
        const ehFaixa = /\d\s*\/\s*\d/.test(semMoka) && nums.length === 2 && !temMoka;
        const lista = ehFaixa ? Array.from({ length: Math.max(...nums) - Math.min(...nums) + 1 }, (_, i) => Math.min(...nums) + i) : nums;
        // Tipos só com peneiras baixas tipo 10/11, 10/12 sem moka: grupo "13 e menores"
        lista.forEach((n) => grupos.add(grupoNumero(n)));
      }
      if (temMoka) grupos.add('Moka');
      if (!grupos.size) {
        if (/ESCOLHA|CATA/.test(k)) grupos.add('Catação/Escolha');
        else if (/FDO|FUNDO|^FD/.test(k)) grupos.add('Fundo');
      }
      res = grupos.size ? [...grupos] : ['Outros'];
    }
  }
  res = [...new Set(res.map(juntar))];
  cacheTipos.set(tipo, res);
  return res;
}

function ordemGrupos(lista) {
  const ordem = carregarMapa().grupos;
  return [...new Set(lista)].sort((a, b) => {
    const ia = ordem.indexOf(a), ib = ordem.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
}

function ordemPeneiras(lista) {
  const chave = (p) => {
    const m = /^#\s*(\d+)/.exec(p);
    if (m) return [0, -Number(m[1])];
    const k = norm(p);
    if (k.startsWith('MOKA')) return [1, 0];
    if (k.startsWith('CATA')) return [2, 0];
    if (k.startsWith('FUNDO')) return [3, 0];
    return [4, 0];
  };
  return [...new Set(lista)].sort((a, b) => { const x = chave(a), y = chave(b); return x[0] - y[0] || x[1] - y[1] || a.localeCompare(b); });
}

function filtrar(dados, f) {
  const de = f.de || '0000-00-00', ate = f.ate || '9999-99-99';
  const ok = (r) => (!f.armazem || r.armazem === f.armazem) && (!r.datafinal ? !f.de && !f.ate : r.datafinal >= de && r.datafinal <= ate);
  // a GS entra se tem resultado (saída) no período
  const saidas = dados.saidas.filter(ok);
  const gsSet = new Set(saidas.map((r) => r.gs));
  const entradas = dados.entradas.filter((r) => gsSet.has(r.gs));
  return { entradas, saidas };
}

function montarGuias({ entradas, saidas }, tipoDoLote = new Map()) {
  const guias = new Map();
  const pegar = (r) => {
    if (!guias.has(r.gs)) guias.set(r.gs, { gs: r.gs, datafinal: r.datafinal, armazem: r.armazem, volumeResultInformado: r.volumeResult, _in: new Map(), _out: [] });
    return guias.get(r.gs);
  };
  for (const r of entradas) {
    const g = pegar(r);
    if (!g._in.has(r.lote)) g._in.set(r.lote, { lote: r.lote, volume: r.volume, pen: {} });
    if (r.peneira && r.percentual > 0) {
      const l = g._in.get(r.lote);
      l.pen[r.peneira] = (l.pen[r.peneira] || 0) + r.percentual;
    }
  }
  for (const r of saidas) pegar(r)._out.push({ lote: r.lote, volume: r.volume, tipo: r.tipo, defeito: r.defeito });

  for (const g of guias.values()) {
    const lotesIn = [...g._in.values()];
    g.volumeDespejado = lotesIn.reduce((s, l) => s + l.volume, 0);
    let volClass = 0, volPen = 0;
    const sacasPen = {}, sacasGrupoTipo = {};
    g.lotesEntrada = lotesIn.map((l) => {
      const tot = Object.values(l.pen).reduce((s, v) => s + v, 0);
      const pct = {};
      if (tot > 0) {
        volClass += l.volume; volPen += l.volume;
        for (const [p, v] of Object.entries(l.pen)) {
          pct[p] = (v / tot) * 100;
          sacasPen[p] = (sacasPen[p] || 0) + (l.volume * v) / tot;
        }
        return { lote: l.lote, volume: l.volume, classificado: true, somaOriginal: r2(tot), pct };
      }
      // Lote sem classificação por peneira, mas que é resultado de outra GS: usa o tipo de produto dele
      const tipo = tipoDoLote.get(l.lote);
      if (tipo) {
        const grs = gruposTipo(tipo);
        if (!grs.includes('Resíduo/Perdas')) {
          volClass += l.volume;
          grs.forEach((x) => { sacasGrupoTipo[x] = (sacasGrupoTipo[x] || 0) + l.volume / grs.length; });
          return { lote: l.lote, volume: l.volume, classificado: true, porTipo: tipo, somaOriginal: 100, pct };
        }
      }
      return { lote: l.lote, volume: l.volume, classificado: false, somaOriginal: 0, pct };
    });
    g.volumeClassificado = volClass;
    g.cobertura = g.volumeDespejado > 0 ? (volClass / g.volumeDespejado) * 100 : 0;

    // % por peneira (sobre o volume classificado por peneira)
    g.pctPeneira = {};
    if (volPen > 0) for (const [p, x] of Object.entries(sacasPen)) g.pctPeneira[p] = (x / volPen) * 100;
    // % por grupo: peneiras + lotes classificados pelo tipo, sobre todo o volume classificado
    g.pctGrupoIn = {};
    const sacasGrupo = { ...sacasGrupoTipo };
    for (const [p, x] of Object.entries(sacasPen)) { const gr = grupoPeneira(p); sacasGrupo[gr] = (sacasGrupo[gr] || 0) + x; }
    if (volClass > 0) for (const [gr, x] of Object.entries(sacasGrupo)) g.pctGrupoIn[gr] = (x / volClass) * 100;
    g.volumePeneira = volPen;
    g.esperado = {};
    for (const [gr, v] of Object.entries(g.pctGrupoIn)) g.esperado[gr] = (g.volumeDespejado * v) / 100;

    // Resultado por tipo e por grupo
    g.porTipo = {};
    g.resultado = {};
    g.lotesSaida = g._out.map((s) => {
      g.porTipo[s.tipo] = (g.porTipo[s.tipo] || 0) + s.volume;
      const grs = gruposTipo(s.tipo);
      const base = grs.map((x) => g.pctGrupoIn[x] || 0);
      const tot = base.reduce((a, b) => a + b, 0);
      grs.forEach((x, i) => { g.resultado[x] = (g.resultado[x] || 0) + s.volume * (tot > 0 ? base[i] / tot : 1 / grs.length); });
      return { ...s, grupos: grs.join(' + ') };
    });
    g.volumeResultado = g._out.reduce((s, x) => s + x.volume, 0);
    g.rendimento = g.volumeDespejado > 0 ? (g.volumeResultado / g.volumeDespejado) * 100 : null;
    g.comparavel = g.volumeClassificado > 0 && g.volumeResultado > 0;
    g.aderencia = g.comparavel ? aderencia(g.esperado, g.volumeDespejado, g.resultado, g.volumeResultado) : null;
    delete g._in; delete g._out;
  }
  return [...guias.values()];
}

function aderencia(esp, volEsp, res, volRes) {
  if (!volEsp || !volRes) return null;
  const grs = new Set([...Object.keys(esp), ...Object.keys(res)]);
  let s = 0;
  for (const x of grs) s += Math.abs(((res[x] || 0) / volRes) * 100 - ((esp[x] || 0) / volEsp) * 100);
  return 100 - s / 2;
}

function linhasGrupo(esp, volEsp, res, volRes) {
  return ordemGrupos([...Object.keys(esp), ...Object.keys(res)]).map((x) => {
    const e = esp[x] || 0, r = res[x] || 0;
    const pe = volEsp ? (e / volEsp) * 100 : 0, pr = volRes ? (r / volRes) * 100 : 0;
    return { grupo: x, sacasEsperadas: r2(e), sacasResultado: r2(r), difSacas: r2(r - e), pctDespejado: r2(pe), pctResultado: r2(pr), diferenca: r2(pr - pe) };
  });
}

function resumoGuia(g) {
  return {
    gs: g.gs, datafinal: g.datafinal, armazem: g.armazem,
    volumeDespejado: r2(g.volumeDespejado), volumeResultado: r2(g.volumeResultado),
    rendimento: g.rendimento === null ? null : r2(g.rendimento),
    cobertura: r2(g.cobertura), nLotesEntrada: g.lotesEntrada.length, nLotesSaida: g.lotesSaida.length,
    perdas: r2(g.resultado['Resíduo/Perdas'] || 0),
    aderencia: g.aderencia === null ? null : r2(g.aderencia),
  };
}

function opcoes(dados) {
  const armazens = [...new Set(dados.saidas.map((r) => r.armazem))].sort();
  const datas = dados.saidas.map((r) => r.datafinal).filter(Boolean).sort();
  const tipos = [...new Set(dados.saidas.map((r) => r.tipo))].sort().map((t) => ({ tipo: t, grupos: gruposTipo(t) }));
  return { armazens, dataMin: datas[0] || null, dataMax: datas[datas.length - 1] || null, tipos };
}

function gerar(dados, f) {
  const tipoDoLote = new Map(dados.saidas.map((r) => [r.lote, r.tipo]));
  const guias = montarGuias(filtrar(dados, f), tipoDoLote);
  const minCob = f.cobertura ?? 80;
  const comparaveis = guias.filter((g) => g.comparavel && g.cobertura >= minCob);

  // Totais (só guias comparáveis)
  const esp = {}, res = {}, porTipo = {}, sacasPen = {};
  let volEsp = 0, volRes = 0, volClass = 0, volPenT = 0;
  for (const g of comparaveis) {
    volEsp += g.volumeDespejado; volRes += g.volumeResultado; volClass += g.volumeClassificado; volPenT += g.volumePeneira;
    for (const [k, v] of Object.entries(g.esperado)) esp[k] = (esp[k] || 0) + v;
    for (const [k, v] of Object.entries(g.resultado)) res[k] = (res[k] || 0) + v;
    for (const [k, v] of Object.entries(g.porTipo)) porTipo[k] = (porTipo[k] || 0) + v;
    for (const [k, v] of Object.entries(g.pctPeneira)) sacasPen[k] = (sacasPen[k] || 0) + (v * g.volumePeneira) / 100;
  }
  const ader = aderencia(esp, volEsp, res, volRes);

  let detalhe = null;
  if (f.gs) {
    const g = guias.find((x) => x.gs === f.gs);
    if (g) {
      detalhe = {
        ...resumoGuia(g),
        grupos: linhasGrupo(g.esperado, g.volumeDespejado, g.resultado, g.volumeResultado),
        peneiras: ordemPeneiras(Object.keys(g.pctPeneira)).map((p) => ({ peneira: p, grupo: grupoPeneira(p), pct: r2(g.pctPeneira[p]), sacas: r2((g.volumeDespejado * g.pctPeneira[p]) / 100) })),
        tipos: Object.entries(g.porTipo).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ tipo: t, grupos: gruposTipo(t).join(' + '), sacas: r2(v), pct: r2((v / g.volumeResultado) * 100) })),
        lotesEntrada: g.lotesEntrada.map((l) => ({ ...l, volume: r2(l.volume), pct: Object.fromEntries(Object.entries(l.pct).map(([k, v]) => [k, r2(v)])) })),
        lotesSaida: g.lotesSaida.map((l) => ({ ...l, volume: r2(l.volume) })),
      };
    }
  }

  return {
    filtros: f,
    kpis: {
      guias: guias.length,
      guiasComparaveis: comparaveis.length,
      guiasSemClassificacao: guias.filter((g) => g.volumeClassificado === 0).length,
      volumeDespejado: r2(volEsp), volumeResultado: r2(volRes),
      rendimento: volEsp ? r2((volRes / volEsp) * 100) : null,
      perdas: r2(res['Resíduo/Perdas'] || 0),
      perdasPct: volRes ? r2(((res['Resíduo/Perdas'] || 0) / volRes) * 100) : null,
      aderencia: ader === null ? null : r2(ader),
    },
    grupos: linhasGrupo(esp, volEsp, res, volRes),
    peneiras: ordemPeneiras(Object.keys(sacasPen)).map((p) => ({ peneira: p, grupo: grupoPeneira(p), pct: r2(volPenT ? (sacasPen[p] / volPenT) * 100 : 0) })),
    tipos: Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ tipo: t, grupos: gruposTipo(t).join(' + '), sacas: r2(v), pct: r2(volRes ? (v / volRes) * 100 : 0) })),
    guias: guias.map(resumoGuia).sort((a, b) => (b.datafinal || '').localeCompare(a.datafinal || '') || b.gs.localeCompare(a.gs)),
    detalhe,
  };
}

module.exports = { gerar, opcoes, gruposTipo, grupoPeneira, ordemGrupos };
