// Busca os dados brutos (do banco ou do arquivo demo) e guarda em cache por alguns minutos.
const path = require('path');
const fs = require('fs');

// Classificação das amostras vinculadas aos contratos de COMPRA (tipo = 0)
const SQL_AMOSTRAS = `
SELECT c.numero AS contrato, c.quantidade, c.data AS dataContrato, LEFT(d.nome, 40) AS fornecedor,
       a.numero AS amostra, a.data AS dataAmostra, p.classificacao AS peneira, bc.percentual
  FROM tb_contrato_cv c
 INNER JOIN tb_domicilio d            ON d.id = c.iddomicilio
 INNER JOIN TB_CONTRATO_AMOSTRA ca    ON ca.IDContrato = c.id
 INNER JOIN tb_amostra a              ON a.id = ca.IDAmostra
 INNER JOIN TB_BLEND_CLASSIFICACAO bc ON bc.idamostra = a.id
 INNER JOIN TB_CONFIGURACAO_PENEIRA p ON p.id = bc.idpeneira
 WHERE c.tipo = 0 AND bc.percentual > 0`;

// Classificação dos lotes que entraram por contrato de compra
const SQL_ENTRADAS = `
SELECT c.numero AS contrato, c.quantidade, c.data AS dataContrato, LEFT(d.nome, 40) AS fornecedor,
       l.numero AS lote, l.data AS dataEntrada, l.VolumeInicial AS volume, arma.nome AS armazem,
       p.classificacao AS peneira, lc.percentual
  FROM tb_lote l
 INNER JOIN tb_gc_entra e              ON e.idlote = l.id
 INNER JOIN tb_contrato_cv c           ON c.id = e.idcontratocompra
 INNER JOIN tb_domicilio d             ON d.id = c.iddomicilio
 INNER JOIN tb_lote_classificacao lc   ON lc.idlote = l.id
 INNER JOIN TB_CONFIGURACAO_PENEIRA p  ON p.id = lc.idpeneira
  LEFT JOIN tb_gci g                   ON g.id = e.idgci
  LEFT JOIN TB_DOMICILIO arma          ON arma.id = g.iddomicilio
 WHERE c.tipo = 0 AND lc.percentual > 0`;

const cache = { dados: null, quando: 0 };

function dia(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function limpar(r) {
  return {
    ...r,
    contrato: String(r.contrato).trim(),
    fornecedor: r.fornecedor ? String(r.fornecedor).trim() : '(sem nome)',
    peneira: String(r.peneira).trim(),
    quantidade: Number(r.quantidade) || 0,
    percentual: Number(r.percentual) || 0,
    volume: r.volume !== undefined ? Number(r.volume) || 0 : undefined,
    dataContrato: dia(r.dataContrato),
    dataAmostra: dia(r.dataAmostra),
    dataEntrada: dia(r.dataEntrada),
    armazem: r.armazem ? String(r.armazem).trim() : null,
  };
}

async function carregar({ demo, db, forcar = false }) {
  const ttl = (Number(process.env.CACHE_MINUTOS) || 5) * 60 * 1000;
  if (!forcar && cache.dados && Date.now() - cache.quando < ttl) return cache.dados;

  let amostras, entradas;
  if (demo) {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'demo.json'), 'utf8'));
    amostras = j.amostras; entradas = j.entradas;
  } else {
    [amostras, entradas] = await Promise.all([db.query(SQL_AMOSTRAS), db.query(SQL_ENTRADAS)]);
  }
  cache.dados = { amostras: amostras.map(limpar), entradas: entradas.map(limpar), atualizadoEm: new Date().toISOString() };
  cache.quando = Date.now();
  return cache.dados;
}

// ================= Guia de Serviço (rebenefício) =================
// Café DESPEJADO na GS: lotes de entrada da guia + classificação por peneira de cada lote
const SQL_GS_ENTRADA = `
SELECT g.numero AS gs, g.datafinal, g.VolumeResult AS volumeResult, LEFT(d.nome, 40) AS armazem,
       l.numero AS lote, le.volume, p.classificacao AS peneira, lc.percentual
  FROM tb_gs_lote_entrada le
 INNER JOIN tb_guia_servico g              ON g.id = le.idguiaservico
 INNER JOIN tb_lote l                      ON l.id = le.idlote
  LEFT JOIN TB_DOMICILIO d                 ON d.id = g.IDDomicilio
  LEFT JOIN tb_lote_classificacao lc       ON lc.idlote = l.id AND lc.percentual > 0
  LEFT JOIN TB_CONFIGURACAO_PENEIRA p      ON p.id = lc.idpeneira
 WHERE le.volume > 0`;

// RESULTADO da GS: lotes de saída com o tipo de produto
const SQL_GS_SAIDA = `
SELECT g.numero AS gs, g.datafinal, g.VolumeResult AS volumeResult, LEFT(d.nome, 40) AS armazem,
       l.numero AS lote, ls.Volume AS volume, tp.nome AS tipo, l.defeito
  FROM tb_gs_lote_saida ls
 INNER JOIN tb_guia_servico g   ON g.id = ls.idguiaservico
 INNER JOIN tb_lote l           ON l.numero = ls.numero
  LEFT JOIN TB_TIPO_PRODUTO tp  ON tp.id = l.IDTipo_Prod
  LEFT JOIN TB_DOMICILIO d      ON d.id = g.IDDomicilio
 WHERE ls.Volume > 0`;

const cacheGS = { dados: null, quando: 0 };

function limparGS(r) {
  return {
    gs: String(r.gs).trim(),
    datafinal: dia(r.datafinal),
    volumeResult: Number(r.volumeResult) || 0,
    armazem: r.armazem ? String(r.armazem).trim() : '(sem armazém)',
    lote: String(r.lote).trim(),
    volume: Number(r.volume) || 0,
    peneira: r.peneira ? String(r.peneira).trim() : null,
    percentual: r.percentual === null || r.percentual === undefined ? null : Number(r.percentual),
    tipo: r.tipo !== undefined ? (r.tipo ? String(r.tipo).trim() : '(sem tipo)') : undefined,
    defeito: r.defeito !== undefined && r.defeito !== null ? Number(String(r.defeito).replace(',', '.')) || 0 : undefined,
  };
}

async function carregarGS({ demo, db, forcar = false }) {
  const ttl = (Number(process.env.CACHE_MINUTOS) || 5) * 60 * 1000;
  if (!forcar && cacheGS.dados && Date.now() - cacheGS.quando < ttl) return cacheGS.dados;
  let entradas, saidas;
  if (demo) {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'demo-gs.json'), 'utf8'));
    entradas = j.entradas; saidas = j.saidas;
  } else {
    [entradas, saidas] = await Promise.all([db.query(SQL_GS_ENTRADA), db.query(SQL_GS_SAIDA)]);
  }
  cacheGS.dados = { entradas: entradas.map(limparGS), saidas: saidas.map(limparGS), atualizadoEm: new Date().toISOString() };
  cacheGS.quando = Date.now();
  return cacheGS.dados;
}

// ================= Vendas =================
// Contratos de VENDA (tudo que não é compra: tipo <> 0) com a classificação da amostra
const SQL_VENDAS_AMOSTRA = `
SELECT c.numero AS contrato, COALESCE(NULLIF(c.quantidade, 0), c.Volume) AS quantidade, c.data AS dataContrato,
       LEFT(d.nome, 40) AS cliente, a.numero AS amostra, p.classificacao AS peneira, bc.percentual
  FROM tb_contrato_cv c
 INNER JOIN tb_domicilio d            ON d.id = c.iddomicilio
 INNER JOIN TB_CONTRATO_AMOSTRA ca    ON ca.IDContrato = c.id
 INNER JOIN tb_amostra a              ON a.id = ca.IDAmostra
 INNER JOIN TB_BLEND_CLASSIFICACAO bc ON bc.idamostra = a.id
 INNER JOIN TB_CONFIGURACAO_PENEIRA p ON p.id = bc.idpeneira
 WHERE c.tipo <> 0 AND bc.percentual > 0`;

// Lotes vinculados (despejados) nos contratos de venda, com a classificação por peneira do lote
const SQL_VENDAS_LOTES = `
SELECT c.numero AS contrato, COALESCE(NULLIF(c.quantidade, 0), c.Volume) AS quantidade, c.data AS dataContrato,
       LEFT(d.nome, 40) AS cliente, l.numero AS lote, l.VolumeInicial AS volume, tp.nome AS tipo,
       p.classificacao AS peneira, lc.percentual
  FROM tb_contrato_cv c
 INNER JOIN tb_domicilio d                ON d.id = c.iddomicilio
 INNER JOIN TB_CONTRATO_LOTEDESPEJO ld    ON ld.IDContrato = c.id
 INNER JOIN tb_lote l                     ON l.id = ld.IDLote
  LEFT JOIN TB_TIPO_PRODUTO tp            ON tp.id = l.IDTipo_Prod
  LEFT JOIN tb_lote_classificacao lc      ON lc.idlote = l.id AND lc.percentual > 0
  LEFT JOIN TB_CONFIGURACAO_PENEIRA p     ON p.id = lc.idpeneira
 WHERE c.tipo <> 0`;

const cacheV = { dados: null, quando: 0 };
function limparV(r) {
  return {
    contrato: String(r.contrato).trim(), quantidade: Number(r.quantidade) || 0, dataContrato: dia(r.dataContrato),
    cliente: r.cliente ? String(r.cliente).trim() : '(sem nome)', amostra: r.amostra ? String(r.amostra).trim() : undefined,
    lote: r.lote ? String(r.lote).trim() : undefined, tipo: r.tipo ? String(r.tipo).trim() : (r.lote ? '(sem tipo)' : undefined), volume: r.volume !== undefined ? Number(r.volume) || 0 : undefined,
    peneira: r.peneira ? String(r.peneira).trim() : null, percentual: r.percentual === null || r.percentual === undefined ? null : Number(r.percentual),
  };
}
async function carregarVendas({ demo, db, forcar = false }) {
  const ttl = (Number(process.env.CACHE_MINUTOS) || 5) * 60 * 1000;
  if (!forcar && cacheV.dados && Date.now() - cacheV.quando < ttl) return cacheV.dados;
  let amostras, lotes;
  if (demo) {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'demo-vendas.json'), 'utf8'));
    amostras = j.amostras; lotes = j.lotes;
  } else {
    [amostras, lotes] = await Promise.all([db.query(SQL_VENDAS_AMOSTRA), db.query(SQL_VENDAS_LOTES)]);
  }
  cacheV.dados = { amostras: amostras.map(limparV), lotes: lotes.map(limparV), atualizadoEm: new Date().toISOString() };
  cacheV.quando = Date.now();
  return cacheV.dados;
}

module.exports = { carregar, carregarGS, carregarVendas, SQL_VENDAS_AMOSTRA, SQL_VENDAS_LOTES, SQL_AMOSTRAS, SQL_ENTRADAS, SQL_GS_ENTRADA, SQL_GS_SAIDA };

// ================= Rastreabilidade (lucro por lote vendido) =================
// Mesma lógica da procedure Node_RastreabilidadeLote do WMS (sentido VOLTA), feita em memória.
// Preço por saca do contrato = Valor / Quantidade (se não tiver, ValorSaca).
const PRECO_SACA = `CASE WHEN ISNULL(c.Quantidade, 0) > 0 AND ISNULL(c.Valor, 0) > 0 THEN c.Valor / c.Quantidade ELSE NULLIF(c.ValorSaca, 0) END`;
const cacheR = { dados: null, quando: 0 };

async function carregarRastreio({ db, forcar = false }) {
  const ttl = (Number(process.env.CACHE_MINUTOS) || 5) * 60 * 1000;
  if (!forcar && cacheR.dados && Date.now() - cacheR.quando < ttl) return cacheR.dados;
  const [lotes, trans, gsEnt, gsSai, entradas, vendidos] = await Promise.all([
    db.query(`SELECT id, LTRIM(RTRIM(Numero)) AS numero, ISNULL(VolumeInicial, 0) AS volIni, custoInicial, custoTotal FROM tb_lote`),
    db.query(`SELECT IDLote AS de, IDLoteNovo AS para, SUM(ISNULL(Volume, 0)) AS vol FROM tb_trans_lote GROUP BY IDCab, IDLote, IDLoteNovo`),
    db.query(`SELECT IDGuiaServico AS gs, IDLote AS lote, SUM(ISNULL(Volume, 0)) AS vol FROM TB_GS_LOTE_ENTRADA GROUP BY IDGuiaServico, IDLote`),
    db.query(`SELECT IDGuiaServico AS gs, IDLote AS lote, SUM(ISNULL(Volume, 0)) AS vol FROM TB_GS_LOTE_SAIDA WHERE IDLote IS NOT NULL GROUP BY IDGuiaServico, IDLote`),
    // GR de entrada -> contrato de COMPRA
    db.query(`SELECT e.IDLote AS lote, SUM(ISNULL(e.Volume, 0)) AS vol, MAX(g.Numero) AS guia, MAX(g.Data) AS data,
                     MAX(c.Numero) AS contrato, MAX(${PRECO_SACA}) AS preco, MAX(LEFT(d.Nome, 40)) AS fornecedor
                FROM tb_gc_entra e
               INNER JOIN tb_gci g ON g.id = e.IDGCI
                LEFT JOIN tb_contrato_cv c ON c.id = e.idcontratocompra
                LEFT JOIN tb_domicilio d ON d.id = c.IDDomicilio
               WHERE e.IDLote IS NOT NULL
               GROUP BY e.IDGCI, e.IDLote, e.idcontratocompra`),
    // Lotes da GUIA DE SAÍDA (TB_GSBX) -> contrato de VENDA da linha (ou da guia)
    db.query(`SELECT gs.ID AS id, gs.IDLote AS lote, ISNULL(gs.Volume, 0) AS vol, g.Numero AS guia, ISNULL(g.dataEmbarque, g.Data) AS data,
                     c.Numero AS contrato, c.Tipo AS tipoContrato, ${PRECO_SACA} AS preco,
                     LEFT(d.Nome, 40) AS cliente, tp.Nome AS tipo
                FROM TB_GSBX_SAIDA gs
               INNER JOIN TB_GSBX g ON g.id = gs.IDGSBX
                LEFT JOIN tb_contrato_cv c ON c.id = ISNULL(NULLIF(gs.IDContratoVenda, 0), g.IDContrato)
                LEFT JOIN tb_domicilio d ON d.id = c.IDDomicilio
                LEFT JOIN tb_lote l ON l.id = gs.IDLote
                LEFT JOIN TB_TIPO_PRODUTO tp ON tp.id = l.IDTipo_Prod
               WHERE g.dataExclusao IS NULL AND ISNULL(gs.Volume, 0) > 0`),
  ]);
  cacheR.dados = { lotes, trans, gsEnt, gsSai, entradas, vendidos, atualizadoEm: new Date().toISOString() };
  cacheR.quando = Date.now();
  return cacheR.dados;
}

module.exports.carregarRastreio = carregarRastreio;

// ================= Embarque: amostra vendida x lotes embarcados =================
// Primeiro acha os pares (guia, contrato) uma vez só; depois junta amostra e lotes (evita DISTINCT em linhas largas).
const SQL_EMB_LINHAS = `
SELECT gs.ID AS linha, gs.IDGSBX AS gsbx, gs.IDLote AS idLote, gs.Volume AS volume,
       COALESCE(NULLIF(gs.IDContratoVenda, 0), g.IDContrato) AS idContrato, g.Numero AS guia, ISNULL(g.dataEmbarque, g.Data) AS data
  FROM TB_GSBX_SAIDA gs
 INNER JOIN TB_GSBX g ON g.ID = gs.IDGSBX
 WHERE g.dataExclusao IS NULL AND ISNULL(gs.Volume, 0) > 0`;
const SQL_EMB_AMOSTRA = `
WITH lin AS (${SQL_EMB_LINHAS}),
     pares AS (SELECT DISTINCT gsbx, idContrato FROM lin WHERE idContrato IS NOT NULL)
SELECT pr.gsbx, pr.idContrato, a.Numero AS amostra, td.defeito AS defeito, p.classificacao AS peneira, bc.percentual
  FROM pares pr
 INNER JOIN TB_CONTRATO_AMOSTRA ca      ON ca.IDContrato = pr.idContrato
 INNER JOIN tb_amostra a                ON a.id = ca.IDAmostra
  LEFT JOIN tb_tipo_defeito td          ON td.id = a.idtipodefeito
  LEFT JOIN TB_BLEND_CLASSIFICACAO bc   ON bc.idamostra = a.id AND bc.percentual > 0
  LEFT JOIN TB_CONFIGURACAO_PENEIRA p   ON p.id = bc.idpeneira`;
const SQL_EMB_LOTES = `
WITH lin AS (${SQL_EMB_LINHAS})
SELECT lin.linha, lin.gsbx, lin.guia, lin.data, lin.idContrato, c.Numero AS contrato, LEFT(d.Nome, 40) AS cliente,
       l.Numero AS lote, lin.volume, tp.Nome AS tipo, l.Defeito AS defeitoLote, tdl.defeito AS defeitoTipo,
       l.Umidade AS umidade, p.classificacao AS peneira, lc.percentual
  FROM lin
 INNER JOIN tb_lote l                   ON l.id = lin.idLote
  LEFT JOIN tb_contrato_cv c            ON c.id = lin.idContrato
  LEFT JOIN tb_domicilio d              ON d.id = c.IDDomicilio
  LEFT JOIN TB_TIPO_PRODUTO tp          ON tp.id = l.IDTipo_Prod
  LEFT JOIN tb_tipo_defeito tdl         ON tdl.id = l.IDTIPODEFEITO
  LEFT JOIN tb_lote_classificacao lc    ON lc.idlote = l.id AND lc.percentual > 0
  LEFT JOIN TB_CONFIGURACAO_PENEIRA p   ON p.id = lc.idpeneira`;

const cacheE = { dados: null, quando: 0, carregando: null };
async function carregarEmbarque({ db, forcar = false }) {
  const ttl = (Number(process.env.CACHE_MINUTOS) || 5) * 60 * 1000;
  if (!forcar && cacheE.dados && Date.now() - cacheE.quando < ttl) return cacheE.dados;
  if (cacheE.carregando) return cacheE.carregando; // vários pedidos ao mesmo tempo: uma consulta só
  cacheE.carregando = (async () => {
    const t0 = Date.now();
    const [amostrasPorPar, lotes] = await Promise.all([db.query(SQL_EMB_AMOSTRA), db.query(SQL_EMB_LOTES)]);
    // completa a amostra com guia/contrato/cliente vindos das linhas dos lotes
    const info = new Map();
    for (const r of lotes) if (r.idContrato != null) info.set(r.gsbx + '|' + r.idContrato, r);
    const amostras = [];
    for (const a of amostrasPorPar) {
      const r = info.get(a.gsbx + '|' + a.idContrato);
      if (r) amostras.push({ ...a, guia: r.guia, data: r.data, contrato: r.contrato, cliente: r.cliente });
    }
    cacheE.dados = { amostras, lotes, atualizadoEm: new Date().toISOString(), msBanco: Date.now() - t0 };
    cacheE.quando = Date.now();
    return cacheE.dados;
  })();
  try { return await cacheE.carregando; } finally { cacheE.carregando = null; }
}
module.exports.carregarEmbarque = carregarEmbarque;
module.exports.SQL_EMB_AMOSTRA = SQL_EMB_AMOSTRA;
module.exports.SQL_EMB_LOTES = SQL_EMB_LOTES;
