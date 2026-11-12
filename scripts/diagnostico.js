// Testa a conexão, descobre a tabela de usuários e confere as consultas dos relatórios.
// Não mostra senhas de usuários. Saída: diagnostico.txt
require('dotenv').config();
const db = require('../src/db');
const { detectarModo, valorTexto, ident } = require('../src/auth');
const { SQL_AMOSTRAS, SQL_ENTRADAS, SQL_GS_ENTRADA, SQL_GS_SAIDA } = require('../src/fontes');

(async () => {
  const log = (...a) => console.log(...a);
  try {
    log('Servidor:', process.env.DB_SERVER, '| Banco:', process.env.DB_DATABASE, '| Usuário SQL:', process.env.DB_USER);
    const v = await db.query('SELECT @@VERSION AS v, DB_NAME() AS db');
    log('CONEXAO OK ->', v[0].db);

    const tabelas = await db.query(
      `SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE='BASE TABLE' AND (TABLE_NAME LIKE '%usu%' OR TABLE_NAME LIKE '%user%' OR TABLE_NAME LIKE '%login%')`);
    log('\nTABELAS DE USUARIO:'); tabelas.forEach((t) => log('  ', t.TABLE_SCHEMA + '.' + t.TABLE_NAME));

    for (const t of tabelas) {
      const cols = await db.query(
        `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA=@s AND TABLE_NAME=@t ORDER BY ORDINAL_POSITION`, { s: t.TABLE_SCHEMA, t: t.TABLE_NAME });
      log(`\nCOLUNAS ${t.TABLE_NAME}:`);
      cols.forEach((c) => log('   ', c.COLUMN_NAME, `(${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? ',' + c.CHARACTER_MAXIMUM_LENGTH : ''})`));
      const qtd = await db.query(`SELECT COUNT(*) AS n FROM ${ident(t.TABLE_SCHEMA)}.${ident(t.TABLE_NAME)}`);
      log('    linhas:', qtd[0].n);
      const cSenha = (cols.find((c) => /senha|password|pass|pwd/i.test(c.COLUMN_NAME)) || {}).COLUMN_NAME;
      if (cSenha) {
        const am = await db.query(`SELECT TOP 30 ${ident(cSenha)} AS s FROM ${ident(t.TABLE_SCHEMA)}.${ident(t.TABLE_NAME)} WHERE ${ident(cSenha)} IS NOT NULL`);
        const modos = {}; am.forEach((r) => { const m = detectarModo(r.s); modos[m] = (modos[m] || 0) + 1; });
        log(`    formato da senha (${cSenha}):`, JSON.stringify(modos), 'tamanhos:', [...new Set(am.map((r) => valorTexto(r.s).length))].join(','));
      }
      // valores distintos de colunas tipo ativo/status (sem dados pessoais)
      for (const c of cols.filter((c) => /ativo|status|bloq|inativ|situa/i.test(c.COLUMN_NAME))) {
        const d = await db.query(`SELECT TOP 10 ${ident(c.COLUMN_NAME)} AS v, COUNT(*) AS n FROM ${ident(t.TABLE_SCHEMA)}.${ident(t.TABLE_NAME)} GROUP BY ${ident(c.COLUMN_NAME)}`);
        log(`    valores de ${c.COLUMN_NAME}:`, d.map((x) => `${x.v}=${x.n}`).join(' | '));
      }
    }

    log('\nCONSULTAS DO RELATORIO:');
    const a = await db.query(SQL_AMOSTRAS);
    log('  amostras: linhas', a.length, '| contratos', new Set(a.map((r) => r.contrato)).size);
    const e = await db.query(SQL_ENTRADAS);
    log('  entradas: linhas', e.length, '| lotes', new Set(e.map((r) => r.lote)).size, '| com armazem', e.filter((r) => r.armazem).length);
    const ge = await db.query(SQL_GS_ENTRADA);
    log('  GS despejado: linhas', ge.length, '| guias', new Set(ge.map((r) => r.gs)).size, '| lotes', new Set(ge.map((r) => r.gs + r.lote)).size, '| lotes com peneira', new Set(ge.filter((r) => r.peneira).map((r) => r.gs + r.lote)).size);
    const gsai = await db.query(SQL_GS_SAIDA);
    log('  GS resultado: linhas', gsai.length, '| guias', new Set(gsai.map((r) => r.gs)).size);
    const { gruposTipo } = require('../src/relatorios/gs');
    const tipos = {};
    gsai.forEach((r) => { const t = (r.tipo || '(sem tipo)').trim(); tipos[t] = (tipos[t] || 0) + (Number(r.volume) || 0); });
    log('\nTIPOS DE PRODUTO DO RESULTADO -> GRUPO:');
    Object.entries(tipos).sort((a, b) => b[1] - a[1]).forEach(([t, v]) => log('   ', t.padEnd(22), Math.round(v).toString().padStart(8), 'sc ->', gruposTipo(t).join(' + ')));
    const pens = [...new Set(ge.map((r) => r.peneira).filter(Boolean))];
    log('\nPENEIRAS DO DESPEJADO:', pens.join(', '));
    log('\nFIM OK');
    process.exit(0);
  } catch (err) {
    log('ERRO:', err.message);
    process.exit(1);
  }
})();
