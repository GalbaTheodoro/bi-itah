const { idsEmpresa } = require('../empresa');
// Relatório 5: AMOSTRA VENDIDA (contrato de venda ligado à guia de embarque) × LOTES EMBARCADOS na guia.
//
// Para cada guia + contrato de venda:
//  - Peneiras: % da amostra × % dos lotes embarcados (classificação de cada lote, ponderada pelas sacas embarcadas).
//  - Tipo de produto: peneiras da amostra levadas aos grupos (config/mapeamento-gs.json) × sacas dos lotes pelo tipo de produto.
//  - Defeito: defeito da amostra × defeito médio dos lotes (ponderado pelas sacas).
//  Aderência = 100 − metade da soma das diferenças absolutas (% do embarque dentro do padrão da amostra).
const { grupoPeneira, gruposTipo, ordemGrupos } = require('./gs');

const r2 = (n) => Math.round(n * 100) / 100;
const dia = (v) => (!v ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());

function ordenarPeneiras(lista) {
  const chave = (p) => {
    const m = /^#\s*(\d+)/.exec(p); if (m) return [0, -Number(m[1])];
    const k = p.toUpperCase();
    if (k.startsWith('MOKA')) return [1, -(Number(k.replace(/\D/g, '')) || 0)];
    if (k.startsWith('CATA')) return [2, 0];
    if (k.startsWith('FUNDO')) return [3, 0];
    return [4, 0];
  };
  return [...new Set(lista)].sort((a, b) => { const x = chave(a), y = chave(b); return x[0] - y[0] || x[1] - y[1] || a.localeCompare(b); });
}
function aderencia(a, b) {
  const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
  if (!Object.keys(a).length || !Object.keys(b).length) return null;
  let s = 0; for (const k of ks) s += Math.abs((b[k] || 0) - (a[k] || 0));
  return 100 - s / 2;
}
const pct = (m) => { const t = Object.values(m).reduce((a, b) => a + b, 0); const o = {}; if (t > 0) for (const [k, v] of Object.entries(m)) o[k] = (v / t) * 100; return o; };

// Junta as linhas do banco em grupos guia + contrato (amostras e lotes ainda "crus")
function agrupar(d) {
  const emb = new Map();
  const pegar = (r) => {
    const k = `${r.gsbx}|${txt(r.contrato)}`;
    if (!emb.has(k)) emb.set(k, { chave: k, guia: txt(r.guia), data: dia(r.data), contrato: txt(r.contrato), cliente: txt(r.cliente), idEmpresa: null, _am: new Map(), _lotes: new Map() });
    const e = emb.get(k);
    if (!e.idEmpresa && Number(r.idEmpresa) > 0) e.idEmpresa = Number(r.idEmpresa);
    return e;
  };
  for (const r of d.amostras) {
    const e = pegar(r);
    const a = txt(r.amostra);
    if (!e._am.has(a)) e._am.set(a, { amostra: a, defeito: num(r.defeito), pen: {} });
    if (r.peneira && Number(r.percentual) > 0) { const x = e._am.get(a); x.pen[txt(r.peneira)] = (x.pen[txt(r.peneira)] || 0) + Number(r.percentual); }
  }
  for (const r of d.lotes) {
    const e = pegar(r);
    if (!e._lotes.has(r.linha)) {
      const defL = num(r.defeitoLote);
      e._lotes.set(r.linha, { lote: txt(r.lote), guia: txt(r.guia), sacas: Number(r.volume) || 0, tipo: txt(r.tipo) || '(sem tipo)',
        defeito: defL > 0 ? defL : num(r.defeitoTipo), umidade: num(r.umidade), pen: {} });
    }
    if (r.peneira && Number(r.percentual) > 0) { const l = e._lotes.get(r.linha); l.pen[txt(r.peneira)] = (l.pen[txt(r.peneira)] || 0) + Number(r.percentual); }
  }
  return [...emb.values()];
}

// Compara a amostra com os lotes de um grupo (uma guia, ou todas as guias de um contrato)
function calcular(e, amostras, lotes, extra = {}) {
  // amostra: média das amostras do contrato
  const penA = {};
  const comPen = amostras.filter((a) => Object.keys(a.pen).length);
  for (const a of comPen) for (const [p, v] of Object.entries(pct(a.pen))) penA[p] = (penA[p] || 0) + v / comPen.length;
  const defsA = amostras.map((a) => a.defeito).filter((x) => x !== null);
  const defA = defsA.length ? defsA.reduce((s, x) => s + x, 0) / defsA.length : null;
  // lotes: ponderado pelas sacas embarcadas
  const sacas = lotes.reduce((s, l) => s + l.sacas, 0);
  const sacasPen = {}, sacasTipo = {};
  let volPen = 0, volDef = 0, somaDef = 0, volUm = 0, somaUm = 0;
  for (const l of lotes) {
    const p = pct(l.pen);
    if (Object.keys(p).length) { volPen += l.sacas; for (const [k, v] of Object.entries(p)) sacasPen[k] = (sacasPen[k] || 0) + (l.sacas * v) / 100; }
    sacasTipo[l.tipo] = (sacasTipo[l.tipo] || 0) + l.sacas;
    if (l.defeito !== null) { volDef += l.sacas; somaDef += l.sacas * l.defeito; }
    if (l.umidade > 0) { volUm += l.sacas; somaUm += l.sacas * l.umidade; }
    l.pct = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, r2(v)]));
  }
  const penL = {}; if (volPen > 0) for (const [k, v] of Object.entries(sacasPen)) penL[k] = (v / volPen) * 100;
  // grupos: amostra (peneira -> grupo) x lotes (tipo de produto -> grupo)
  const grA = {}; for (const [p, v] of Object.entries(penA)) { const g = grupoPeneira(p); grA[g] = (grA[g] || 0) + v; }
  const grS = {}; let volTipo = 0;
  for (const [t, v] of Object.entries(sacasTipo)) {
    if (t === '(sem tipo)') continue;
    volTipo += v;
    const gs = gruposTipo(t), base = gs.map((x) => grA[x] || 0), tot = base.reduce((a, b) => a + b, 0);
    gs.forEach((x, i) => { grS[x] = (grS[x] || 0) + v * (tot > 0 ? base[i] / tot : 1 / gs.length); });
  }
  const grL = {}; if (volTipo > 0) for (const [k, v] of Object.entries(grS)) grL[k] = (v / volTipo) * 100;

  const defL = volDef > 0 ? somaDef / volDef : null;
  const adP = aderencia(penA, penL), adT = aderencia(grA, grL);
  return {
    chave: e.chave, guia: e.guia, data: e.data, contrato: e.contrato, cliente: e.cliente, idEmpresa: e.idEmpresa || null,
    amostras: amostras.map((a) => a.amostra).join(', '), sacas: r2(sacas), nLotes: lotes.length,
    defeitoAmostra: defA === null ? null : r2(defA), defeitoLotes: defL === null ? null : r2(defL),
    difDefeito: defA !== null && defL !== null ? r2(defL - defA) : null,
    umidadeLotes: volUm > 0 ? r2(somaUm / volUm) : null,
    aderenciaPeneira: adP === null ? null : r2(adP), aderenciaTipo: adT === null ? null : r2(adT),
    tipos: Object.entries(sacasTipo).sort((a, b) => b[1] - a[1]).map(([t, v]) => `${t} (${r2(v)})`).join(', '),
    ...extra,
    _det: { penA, penL, grA, grL, lotes, sacasTipo, amostras },
  };
}

function montar(d) {
  const lista = [];
  for (const e of agrupar(d)) {
    const lotes = [...e._lotes.values()];
    if (lotes.length) lista.push(calcular(e, [...e._am.values()], lotes));
  }
  return lista;
}

// Todas as guias de um contrato juntas: amostra do contrato × todos os lotes embarcados nele
function consolidar(guias) {
  const ord = [...guias].sort((a, b) => (a.data || '').localeCompare(b.data || '') || a.guia.localeCompare(b.guia));
  const am = new Map();
  for (const g of ord) for (const a of g._det.amostras) if (!am.has(a.amostra)) am.set(a.amostra, a);
  const lotes = ord.flatMap((g) => g._det.lotes.map((l) => ({ ...l, pen: l.pen })));
  const datas = ord.map((g) => g.data).filter(Boolean);
  const c = calcular(
    { chave: 'TODAS|' + ord[0].contrato, guia: `${ord.length} guias`, data: datas[datas.length - 1] || null, contrato: ord[0].contrato, cliente: ord[0].cliente, idEmpresa: ord[0].idEmpresa },
    [...am.values()], lotes,
    { consolidado: true, dataIni: datas[0] || null, dataFim: datas[datas.length - 1] || null },
  );
  // comparação guia a guia (para o gráfico e a tabela do consolidado)
  c._det.porGuia = ord.map((g) => ({ chave: g.chave, guia: g.guia, data: g.data, sacas: g.sacas, nLotes: g.nLotes,
    aderenciaPeneira: g.aderenciaPeneira, aderenciaTipo: g.aderenciaTipo, defeitoLotes: g.defeitoLotes, difDefeito: g.difDefeito, umidadeLotes: g.umidadeLotes }));
  return c;
}

const cacheMontar = new WeakMap();
function montarCache(d) { if (!cacheMontar.has(d)) cacheMontar.set(d, montar(d)); return cacheMontar.get(d); }

function detalheDe(e) {
  const { penA, penL, grA, grL, lotes, sacasTipo, amostras, porGuia } = e._det;
  const pens = ordenarPeneiras([...Object.keys(penA), ...Object.keys(penL)]);
  return {
    amostrasDet: amostras.map((a) => ({ amostra: a.amostra, defeito: a.defeito, pct: Object.fromEntries(Object.entries(pct(a.pen)).map(([k, v]) => [k, r2(v)])) })),
    peneiras: pens.map((p) => ({ peneira: p, amostra: r2(penA[p] || 0), lotes: r2(penL[p] || 0), diferenca: r2((penL[p] || 0) - (penA[p] || 0)) })),
    grupos: ordemGrupos([...Object.keys(grA), ...Object.keys(grL)]).map((g) => ({ grupo: g, amostra: r2(grA[g] || 0), lotes: r2(grL[g] || 0), diferenca: r2((grL[g] || 0) - (grA[g] || 0)) })),
    tiposDet: Object.entries(sacasTipo).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ tipo: t, grupos: t === '(sem tipo)' ? 'fora da conta' : gruposTipo(t).join(' + '), sacas: r2(v) })),
    lotes: lotes.map((l) => ({ lote: l.lote, guia: l.guia, sacas: r2(l.sacas), tipo: l.tipo, defeito: l.defeito, umidade: l.umidade, pct: l.pct })),
    porGuia: porGuia || null,
  };
}

function gerar(d, f) {
  const de = f.de || '0000-00-00', ate = f.ate || '9999-99-99';
  let lista = montarCache(d).filter((e) => (!e.data || (e.data >= de && e.data <= ate)) && (!f.cliente || e.cliente === f.cliente) && (!f.contrato || e.contrato.toLowerCase().includes(String(f.contrato).toLowerCase())));
  lista.sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.guia.localeCompare(a.guia));
  // Filtrou contrato: cada contrato com mais de uma guia ganha uma linha "todas as guias" no topo
  const consolidados = [];
  if (f.contrato) {
    const porContrato = new Map();
    for (const e of lista) if (e.contrato) (porContrato.get(e.contrato) || porContrato.set(e.contrato, []).get(e.contrato)).push(e);
    for (const gs of porContrato.values()) if (gs.length > 1) consolidados.push(consolidar(gs));
  }
  const comAmostra = lista.filter((e) => e.aderenciaPeneira !== null || e.aderenciaTipo !== null || e.defeitoAmostra !== null);
  const pond = (k) => { let s = 0, v = 0; for (const e of lista) if (e[k] !== null) { s += e[k] * e.sacas; v += e.sacas; } return v ? r2(s / v) : null; };

  // todos os detalhes vão juntos: na tela, abrir um embarque não precisa voltar ao servidor
  const detalhes = {};
  for (const e of [...consolidados, ...lista]) detalhes[e.chave] = detalheDe(e);
  return {
    kpis: {
      embarques: lista.length, comAmostra: comAmostra.length, sacas: r2(lista.reduce((s, x) => s + x.sacas, 0)),
      aderenciaPeneira: pond('aderenciaPeneira'), aderenciaTipo: pond('aderenciaTipo'),
      defeitoAmostra: pond('defeitoAmostra'), defeitoLotes: pond('defeitoLotes'),
      acimaDefeito: lista.filter((x) => x.difDefeito > 0).length,
    },
    embarques: [...consolidados, ...lista].map((x) => ({ ...x, _det: undefined })),
    consolidados: consolidados.map((x) => x.chave),
    empresas: idsEmpresa(lista),
    clientes: [...new Set(montarCache(d).map((x) => x.cliente).filter(Boolean))].sort(),
    contratos: [...new Set(montarCache(d).map((x) => x.contrato).filter(Boolean))].sort((a, b) => b.localeCompare(a, 'pt-BR', { numeric: true })),
    detalhes,
  };
}

module.exports = { gerar };
