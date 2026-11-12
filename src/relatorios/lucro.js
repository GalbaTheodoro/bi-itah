// Relatório 4: Lucro por lote vendido, com o custo vindo dos lotes GR de origem.
//
// Rastreio (igual à procedure Node_RastreabilidadeLote do WMS, sentido VOLTA):
//  - Guia de serviço que gerou o lote: volta para cada lote que entrou na guia, na proporção em que entrou.
//  - Transferência que gerou o lote: volta para o lote usado.
//  - Guia de entrada (GR, tb_gc_entra): fim do caminho -> contrato de compra -> preço de compra.
//  Fração = quanto do lote vendido veio daquela origem.
//
// Custo por saca = média do custoInicial / custoTotal dos LOTES GR de origem (tb_lote), pesada pela fração.
// Lote GR sem custo: usa o preço do contrato de compra (Valor / Quantidade).
// Lucro = (preço de venda − custo por saca) × sacas da guia de saída.
// Preço por saca de compra e de venda = Valor / Quantidade do contrato. Contrato de exportação (tipo 2, IT) está em US$: × cotação.
// O custo é rateado por VOLUME: toda saca que sai de uma guia de serviço carrega o mesmo custo médio.

const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;

function indexar(d) {
  const lote = new Map(d.lotes.map((l) => [l.id, l]));
  const transPara = new Map(); // lote novo -> [{de, vol}]
  for (const t of d.trans) { if (!transPara.has(t.para)) transPara.set(t.para, []); transPara.get(t.para).push(t); }
  const entPorGs = new Map(); // gs -> [{lote, vol}]
  for (const e of d.gsEnt) { if (!entPorGs.has(e.gs)) entPorGs.set(e.gs, []); entPorGs.get(e.gs).push(e); }
  const saiPorLote = new Map(); // lote -> [{gs, vol}]
  for (const s of d.gsSai) { if (!saiPorLote.has(s.lote)) saiPorLote.set(s.lote, []); saiPorLote.get(s.lote).push(s); }
  const entradaPorLote = new Map(); // lote -> [GR]
  for (const e of d.entradas) { if (!entradaPorLote.has(e.lote)) entradaPorLote.set(e.lote, []); entradaPorLote.get(e.lote).push(e); }
  return { lote, transPara, entPorGs, saiPorLote, entradaPorLote };
}

const parte = (vol, volIni) => (!(volIni > 0) || vol >= volIni ? 1 : vol / volIni);

// Retorna a lista de origens GR do lote, com a fração de cada uma
function rastrear(ix, idLote, maxNivel = 30) {
  const origens = [];
  let truncado = false;
  const pilha = [{ id: idLote, fr: 1, nivel: 0, caminho: new Set([idLote]) }];
  let passos = 0;
  while (pilha.length) {
    const p = pilha.pop();
    if (++passos > 20000) { truncado = true; break; }
    const lx = ix.lote.get(p.id);
    const volIni = lx ? Number(lx.volIni) : 0;
    for (const e of ix.entradaPorLote.get(p.id) || []) {
      origens.push({ ...e, loteId: p.id, fr: p.fr * parte(Number(e.vol), volIni), nivel: p.nivel + 1 });
    }
    if (p.nivel >= maxNivel) { truncado = true; continue; }
    for (const t of ix.transPara.get(p.id) || []) {
      if (p.caminho.has(t.de)) continue;
      pilha.push({ id: t.de, fr: p.fr * parte(Number(t.vol), volIni), nivel: p.nivel + 1, caminho: new Set([...p.caminho, t.de]) });
    }
    for (const s of ix.saiPorLote.get(p.id) || []) {
      const ents = ix.entPorGs.get(s.gs) || [];
      const tot = ents.reduce((a, e) => a + Number(e.vol), 0);
      for (const e of ents) {
        if (p.caminho.has(e.lote)) continue;
        const prop = tot > 0 ? Number(e.vol) / tot : 1 / ents.length;
        pilha.push({ id: e.lote, fr: p.fr * prop * parte(Number(s.vol), volIni), nivel: p.nivel + 1, caminho: new Set([...p.caminho, e.lote]) });
      }
    }
  }
  return { origens, truncado };
}

const dia = (v) => (!v ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

function gerar(d, f) {
  const ix = indexar(d);
  const de = f.de || '0000-00-00', ate = f.ate || '9999-99-99';
  const resultado = [];
  for (const v of d.vendidos) {
    const data = dia(v.data);
    if (data && (data < de || data > ate)) continue;
    const cliente = (v.cliente || '').trim();
    if (f.cliente && cliente !== f.cliente) continue;
    const lx = ix.lote.get(v.lote);
    if (!lx) continue;
    const sacas = Number(v.vol) || 0;            // sacas que saíram na guia de saída
    const exporta = Number(v.tipoContrato) === 2; // contrato de exportação (IT): preço em US$
    const { origens, truncado } = rastrear(ix, v.lote);

    // agrupa por GR + contrato
    const ag = new Map();
    for (const o of origens) {
      const k = `${o.guia}|${o.loteId}`;
      if (!ag.has(k)) {
        const lo = ix.lote.get(o.loteId) || {};
        const precoContrato = o.preco === null || o.preco === undefined ? null : Number(o.preco);
        // custo do LOTE GR (por saca); sem custo no lote, usa o preço do contrato de compra
        const cIni = Number(lo.custoInicial) > 0 ? Number(lo.custoInicial) : precoContrato;
        const cTot = Number(lo.custoTotal) > 0 ? Number(lo.custoTotal) : cIni;
        ag.set(k, { guia: o.guia, loteGR: lo.numero, data: dia(o.data), contrato: o.contrato, fornecedor: (o.fornecedor || '').trim(),
          custoInicial: cIni, custoTotal: cTot, doContrato: !(Number(lo.custoInicial) > 0), fr: 0 });
      }
      ag.get(k).fr += o.fr;
    }
    const orig = [...ag.values()].sort((a, b) => b.fr - a.fr);
    let volRastreado = 0, volComPreco = 0, custoI = 0, custoT = 0;
    for (const o of orig) {
      const vol = o.fr * sacas;
      volRastreado += vol;
      if (o.custoInicial > 0) { volComPreco += vol; custoI += vol * o.custoInicial; custoT += vol * (o.custoTotal || o.custoInicial); }
    }
    const custoIniSaca = volComPreco > 0 ? custoI / volComPreco : null;
    const custoSaca = volComPreco > 0 ? custoT / volComPreco : null;
    const precoOrig = v.preco === null || v.preco === undefined ? null : Number(v.preco);
    const precoVenda = precoOrig === null ? null : exporta ? (f.dolar > 0 ? precoOrig * f.dolar : null) : precoOrig;
    const lucroSaca = custoSaca !== null && precoVenda > 0 ? precoVenda - custoSaca : null;
    resultado.push({
      id: v.id, guia: (v.guia || '').trim(), lote: lx.numero, contrato: (v.contrato || '').trim(), cliente, data, tipo: v.tipo ? v.tipo.trim() : null,
      moeda: exporta ? 'US$' : 'R$', precoContrato: precoOrig === null ? null : r2(precoOrig),
      sacas: r2(sacas), precoVenda: precoVenda === null ? null : r2(precoVenda),
      custoSaca: custoSaca === null ? null : r2(custoSaca),
      custoIniSaca: custoIniSaca === null ? null : r2(custoIniSaca),
      lucroIni: custoIniSaca !== null && precoVenda > 0 ? r2((precoVenda - custoIniSaca) * sacas) : null,
      lucroSaca: lucroSaca === null ? null : r2(lucroSaca),
      receita: precoVenda > 0 ? r2(precoVenda * sacas) : null,
      custoTotal: custoSaca === null ? null : r2(custoSaca * sacas),
      lucro: lucroSaca === null ? null : r2(lucroSaca * sacas),
      margem: lucroSaca !== null && precoVenda > 0 ? r2((lucroSaca / precoVenda) * 100) : null,
      rastreado: sacas > 0 ? r2(Math.min(100, (volRastreado / sacas) * 100)) : 0,
      comPreco: sacas > 0 ? r2(Math.min(100, (volComPreco / sacas) * 100)) : 0,
      truncado,
      origens: String(f.id) === String(v.id) ? orig.map((o) => ({ ...o, pct: r2(o.fr * 100), sacas: r2(o.fr * sacas), custo: o.custoTotal > 0 ? r2(o.fr * sacas * o.custoTotal) : null, fr: undefined })) : undefined,
      nOrigens: orig.length,
    });
  }
  resultado.sort((a, b) => (b.data || '').localeCompare(a.data || '') || a.lote.localeCompare(b.lote));

  const comLucro = resultado.filter((r) => r.lucro !== null);
  const soma = (k) => comLucro.reduce((a, r) => a + r[k], 0);
  const sacasCalc = soma('sacas');
  const porCliente = new Map();
  for (const r of comLucro) {
    if (!porCliente.has(r.cliente)) porCliente.set(r.cliente, { cliente: r.cliente, sacas: 0, receita: 0, custo: 0, lucro: 0, lotes: 0 });
    const c = porCliente.get(r.cliente); c.sacas += r.sacas; c.receita += r.receita; c.custo += r.custoTotal; c.lucro += r.lucro; c.lotes++;
  }
  const clientes = [...porCliente.values()].map((c) => ({ ...c, sacas: r2(c.sacas), receita: r2(c.receita), custo: r2(c.custo), lucro: r2(c.lucro), margem: c.receita ? r2((c.lucro / c.receita) * 100) : null }))
    .sort((a, b) => b.lucro - a.lucro);

  return {
    dolar: f.dolar,
    kpis: {
      lotes: resultado.length, lotesCalculados: comLucro.length,
      sacas: r2(sacasCalc), receita: r2(soma('receita')), custo: r2(soma('custoTotal')), lucro: r2(soma('lucro')),
      lucroIni: r2(soma('lucroIni')), custoIni: r2(comLucro.reduce((a, r) => a + (r.custoIniSaca || 0) * r.sacas, 0)),
      margem: soma('receita') ? r2((soma('lucro') / soma('receita')) * 100) : null,
      lucroSaca: sacasCalc ? r2(soma('lucro') / sacasCalc) : null,
      semPrecoVenda: resultado.filter((r) => !(r.precoVenda > 0)).length,
      semCusto: resultado.filter((r) => r.custoSaca === null).length,
    },
    clientes,
    lotes: resultado,
  };
}

function opcoes(d) {
  return { clientes: [...new Set(d.vendidos.map((v) => (v.cliente || '').trim()))].filter(Boolean).sort() };
}

module.exports = { gerar, opcoes, rastrear, indexar, r4 };
