// Rastreabilidade de lote: a mesma do WMS Node (procedure dbo.Node_RastreabilidadeLote).
//
// Anda pelas transferências, guias de serviço (com proporcionalidade), embarques e guias de entrada,
// para frente (ida: para onde foi) e para trás (volta: de onde veio, até as GR e o produtor).
//
// Se a procedure estiver instalada no banco do BI, usa ela (fica igual ao WMS mesmo que mude lá).
// Se não estiver, roda o MESMO código da procedure (sql/rastreabilidade.sql) direto como consulta,
// sem precisar criar nada no banco.
const fs = require('fs');
const path = require('path');

const PROCEDURE = 'dbo.Node_RastreabilidadeLote';
const ARQ_SQL = path.join(__dirname, '..', '..', 'sql', 'rastreabilidade.sql');

let corpo = null;
function corpoProcedure() {
  if (corpo) return corpo;
  const s = fs.readFileSync(ARQ_SQL, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const ini = s.search(/\nAS\s*\nBEGIN\b/i);
  const fim = s.search(/\nEND\s*\nGO\b/i);
  if (ini < 0 || fim < 0) throw new Error('sql/rastreabilidade.sql não tem o formato esperado (AS BEGIN ... END GO).');
  corpo = s.slice(s.indexOf('BEGIN', ini) + 5, fim);
  return corpo;
}

let usarProcedure = null; // null = ainda não sabe; true/false depois da primeira tentativa

async function rastrear(db, { idLote = null, numero = null, sentido = 'A', maxNivel = 30, maxLinhas = 5000 }) {
  const { sql } = db;
  const pool = await db.getPool();
  const pedido = () => pool.request()
    .input('IDLote', sql.Int, idLote)
    .input('NumeroLote', sql.VarChar(50), numero)
    .input('Sentido', sql.Char(1), sentido)
    .input('MaxNivel', sql.Int, maxNivel)
    .input('MaxLinhas', sql.Int, maxLinhas);

  let r;
  if (usarProcedure !== false) {
    try {
      r = await pedido().execute(PROCEDURE);
      usarProcedure = true;
    } catch (e) {
      if (e.number !== 2812) throw e; // 2812 = procedure não existe neste banco
      usarProcedure = false;
    }
  }
  if (!r) r = await pedido().query(corpoProcedure());

  const rs = r.recordsets || [];
  const res = {
    lote: (rs[0] || [])[0] || null,
    linhas: rs[1] || [],
    agrupado: rs[2] || [],
    origem: rs[3] || [],
    fonte: usarProcedure ? 'procedure' : 'consulta',
  };
  try { await colocarInfoLotes(db, res); } catch (e) {
    console.error('Rastreabilidade: não deu para buscar tipo/padrão/bebida dos lotes:', e.message);
    res.avisoInfo = 'Não foi possível buscar tipo, padrão e bebida dos lotes: ' + e.message;
  }
  try { await colocarContratos(db, res); } catch (e) {
    console.error('Rastreabilidade: não deu para buscar o contrato das GR:', e.message);
    res.avisoContrato = 'Não foi possível buscar o contrato das GR: ' + e.message;
  }
  return res;
}

// Tipo de produto (peneira), padrão e bebida de cada lote do rastro.
// Lote da linha: o lote a que a linha chega (IDLote); na GR e no embarque, o lote de onde parte (IDLoteAnterior).
// Guia de serviço ainda sem lote resultado fica sem.
const loteDaLinha = (l) => (l.IDLote ? l.IDLote : (l.Movimento === 'ENTRADA' || l.Movimento === 'EMBARQUE') ? l.IDLoteAnterior : null);
async function colocarInfoLotes(db, res) {
  const ids = new Set();
  if (res.lote && res.lote.IDLote) ids.add(Number(res.lote.IDLote));
  for (const l of res.linhas) { if (Number(l.IDLote) > 0) ids.add(Number(l.IDLote)); if (Number(l.IDLoteAnterior) > 0) ids.add(Number(l.IDLoteAnterior)); }
  for (const l of res.agrupado) if (Number(l.IDLote) > 0) ids.add(Number(l.IDLote));
  if (!ids.size) return;
  const lista = [...ids], info = new Map(), porNumero = new Map();
  for (let i = 0; i < lista.length; i += 1000) {
    const rows = await db.query(`
      SELECT l.id, LTRIM(RTRIM(l.Numero)) AS numero, LTRIM(RTRIM(tp.Nome)) AS tipo, LTRIM(RTRIM(pa.Nome)) AS padrao, LTRIM(RTRIM(beb.Nome)) AS bebida
        FROM tb_lote l
        LEFT JOIN TB_TIPO_PRODUTO tp   ON tp.id = l.IDTipo_Prod
        LEFT JOIN TB_PADRAO pa         ON pa.id = l.IDPadrao
        LEFT JOIN TB_CLASSIFICACAO beb ON beb.id = l.IDBebida
       WHERE l.id IN (${lista.slice(i, i + 1000).join(',')})`);
    for (const r of rows) {
      const x = { tipo: r.tipo || null, padrao: r.padrao || null, bebida: r.bebida || null };
      info.set(Number(r.id), x);
      porNumero.set(r.numero, x);
    }
  }
  const juntar = (xs) => {
    const camp = (k) => [...new Set(xs.map((x) => x && x[k]).filter(Boolean))].join(', ') || null;
    return xs.length ? { Tipo: camp('tipo'), Padrao: camp('padrao'), Bebida: camp('bebida') } : {};
  };
  if (res.lote) Object.assign(res.lote, juntar([info.get(Number(res.lote.IDLote))]));
  for (const l of res.linhas) { const id = loteDaLinha(l); if (id) Object.assign(l, juntar([info.get(Number(id))])); }
  for (const l of res.agrupado) {
    if (l.IDLote) { Object.assign(l, juntar([info.get(Number(l.IDLote))])); continue; }
    if (l.Movimento !== 'ENTRADA' && l.Movimento !== 'EMBARQUE') continue;
    const nums = String(l.LotesAnteriores || '').split(',').map((x) => x.trim()).filter(Boolean);
    Object.assign(l, juntar(nums.map((n) => porNumero.get(n)).filter(Boolean)));
  }
  // resumo de origem: lotes formados por cada GR alcançada pela volta
  for (const o of res.origem) {
    const ls = res.linhas.filter((l) => l.Movimento === 'ENTRADA' && l.Sentido === 'V' && Number(l.IDDocumento) === Number(o.IDGuia));
    Object.assign(o, juntar(ls.map((l) => info.get(Number(l.IDLoteAnterior))).filter(Boolean)));
  }
}

// Contrato de cada GR (guia de entrada): tb_gc_entra.idcontratocompra; se vazio ou -1, o idcontratocompra da guia (tb_gci).
// Cada desdobra (linha da tb_gc_entra) pode ter o seu contrato: a ligação é pela guia + lote.
async function colocarContratos(db, res) {
  const ehGR = (l) => l.Movimento === 'ENTRADA';
  const ids = new Set();
  for (const l of [...res.linhas, ...res.agrupado]) if (ehGR(l) && Number(l.IDDocumento) > 0) ids.add(Number(l.IDDocumento));
  for (const o of res.origem) if (Number(o.IDGuia) > 0) ids.add(Number(o.IDGuia));
  if (!ids.size) return;

  const linhas = await db.query(`
    SELECT DISTINCT e.IDGCI AS gci, e.IDLote AS idLote, LTRIM(RTRIM(l.Numero)) AS lote, LTRIM(RTRIM(c.Numero)) AS contrato
      FROM tb_gc_entra e
     INNER JOIN tb_gci g          ON g.id = e.IDGCI
      LEFT JOIN tb_lote l         ON l.id = e.IDLote
      LEFT JOIN tb_contrato_cv c  ON c.id = CASE WHEN e.idcontratocompra IS NULL OR e.idcontratocompra = -1 THEN g.idcontratocompra ELSE e.idcontratocompra END
     WHERE e.IDGCI IN (${[...ids].join(',')})`);

  const porLoteId = new Map(), porLoteNum = new Map(), porGuia = new Map();
  const add = (m, k, v) => { if (!v) return; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  for (const x of linhas) {
    add(porLoteId, `${x.gci}|${x.idLote}`, x.contrato);
    add(porLoteNum, `${x.gci}|${x.lote}`, x.contrato);
    add(porGuia, x.gci, x.contrato);
  }
  const txt = (set) => (set && set.size ? [...set].sort().join(', ') : null);
  const uniao = (...sets) => { const u = new Set(); for (const s of sets) if (s) for (const v of s) u.add(v); return u; };

  // árvore: a linha da GR sabe o lote de onde partiu (IDLoteAnterior)
  for (const l of res.linhas) {
    if (!ehGR(l)) continue;
    l.Contrato = txt(porLoteId.get(`${l.IDDocumento}|${l.IDLoteAnterior}`)) || txt(porGuia.get(Number(l.IDDocumento)));
  }
  // agrupado: lotes de onde partiu vêm por número (LotesAnteriores)
  for (const l of res.agrupado) {
    if (!ehGR(l)) continue;
    const nums = String(l.LotesAnteriores || '').split(',').map((x) => x.trim()).filter(Boolean);
    const u = uniao(...nums.map((n) => porLoteNum.get(`${l.IDDocumento}|${n}`)));
    l.Contrato = txt(u) || txt(porGuia.get(Number(l.IDDocumento)));
  }
  // resumo de origem: contratos das GR alcançadas pela volta
  for (const o of res.origem) {
    const u = uniao(...res.linhas.filter((l) => ehGR(l) && l.Sentido === 'V' && Number(l.IDDocumento) === Number(o.IDGuia))
      .map((l) => porLoteId.get(`${l.IDDocumento}|${l.IDLoteAnterior}`)));
    o.Contrato = txt(u) || txt(porGuia.get(Number(o.IDGuia)));
  }
}

// lista para escolher o lote pelo número
async function buscarLotes(db, q) {
  const t = String(q || '').trim();
  if (!t) return [];
  return db.query(`SELECT TOP 30 id, LTRIM(RTRIM(Numero)) AS numero, Data AS data, VolumeInicial AS volumeInicial, Volume AS saldo
                     FROM tb_lote WHERE Numero LIKE @q ORDER BY CASE WHEN LTRIM(RTRIM(Numero)) = @exato THEN 0 ELSE 1 END, id DESC`,
  { q: '%' + t.replace(/[[\]%_]/g, (c) => '[' + c + ']') + '%', exato: t });
}

module.exports = { rastrear, buscarLotes };
