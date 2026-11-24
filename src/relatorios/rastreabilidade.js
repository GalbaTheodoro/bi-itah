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
  return {
    lote: (rs[0] || [])[0] || null,
    linhas: rs[1] || [],
    agrupado: rs[2] || [],
    origem: rs[3] || [],
    fonte: usarProcedure ? 'procedure' : 'consulta',
  };
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
