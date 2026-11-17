// Origem (contrato de compra das GR) dos lotes, pela rastreabilidade (mesma regra do relatório de lucro / WMS).
const { indexar, rastrear } = require('./lucro');

function criarOrigem(dR) {
  const ix = indexar(dR);
  const idPorNumero = new Map();
  for (const l of dR.lotes) if (!idPorNumero.has(l.numero)) idPorNumero.set(l.numero, l.id);
  const memo = new Map();
  // { contrato: fração 0..1 } de um lote (pelo número)
  function contratosDoLote(numero) {
    if (memo.has(numero)) return memo.get(numero);
    const id = idPorNumero.get(String(numero).trim());
    const out = {};
    if (id !== undefined) for (const o of rastrear(ix, id).origens) if (o.contrato) { const c = String(o.contrato).trim(); out[c] = (out[c] || 0) + o.fr; }
    memo.set(numero, out);
    return out;
  }
  // contratos de compra que aparecem nas GR, com fornecedor
  const contratos = new Map();
  for (const e of dR.entradas) if (e.contrato) contratos.set(String(e.contrato).trim(), (e.fornecedor || '').trim());
  return { contratosDoLote, contratos: [...contratos.entries()].map(([c, f]) => ({ contrato: c, fornecedor: f })).sort((a, b) => b.contrato.localeCompare(a.contrato)) };
}

// Participação (0..100) de um contrato de compra em cada GS, pelo volume despejado
function participacaoPorGS(entradasGS, origem, contrato) {
  const porGS = new Map();
  const vistos = new Set();
  for (const r of entradasGS) {
    const k = r.gs + '|' + r.lote;
    if (vistos.has(k)) continue; // a consulta repete o lote uma vez por peneira
    vistos.add(k);
    if (!porGS.has(r.gs)) porGS.set(r.gs, { vol: 0, doContrato: 0 });
    const g = porGS.get(r.gs);
    g.vol += r.volume;
    g.doContrato += r.volume * Math.min(1, origem.contratosDoLote(r.lote)[contrato] || 0);
  }
  const out = new Map();
  for (const [gs, g] of porGS) if (g.doContrato > 0) out.set(gs, g.vol ? (g.doContrato / g.vol) * 100 : 0);
  return out;
}

module.exports = { criarOrigem, participacaoPorGS };
