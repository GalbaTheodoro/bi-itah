// Descobre a tabela de usuários e o formato da senha, SEM mostrar as senhas.
// Uso: npm run descobrir-usuario            (procura tabelas com "usuario" no nome)
//      npm run descobrir-usuario -- tb_usuario
require('dotenv').config();
const db = require('../src/db');
const { detectarModo, valorTexto, ident } = require('../src/auth');

(async () => {
  try {
    const alvo = process.argv[2];
    const tabelas = await db.query(
      `SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE' AND (TABLE_NAME LIKE '%usuario%' OR TABLE_NAME LIKE '%user%')`);
    console.log('\nTabelas encontradas:');
    tabelas.forEach((t) => console.log(`  - ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`));

    const nome = alvo || (tabelas.find((t) => /^tb_usuario$/i.test(t.TABLE_NAME)) || tabelas[0] || {}).TABLE_NAME;
    if (!nome) { console.log('Nenhuma tabela de usuário encontrada.'); process.exit(0); }

    const cols = await db.query(
      `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @t ORDER BY ORDINAL_POSITION`, { t: nome });
    console.log(`\nColunas de ${nome}:`);
    cols.forEach((c) => console.log(`  - ${c.COLUMN_NAME} (${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? '(' + c.CHARACTER_MAXIMUM_LENGTH + ')' : ''})`));

    const achar = (re) => (cols.find((c) => re.test(c.COLUMN_NAME)) || {}).COLUMN_NAME;
    const cSenha = achar(/senha|password|pass|pwd/i);
    const cLogin = achar(/^login$|usuario$|^user(name)?$|^email$|^apelido$/i) || achar(/login|email|user/i);
    const cNome = achar(/^nome$|^name$/i) || achar(/nome|name/i);
    const cAtivo = achar(/ativo|active|status|bloq/i);

    if (cSenha) {
      const amostra = await db.query(`SELECT TOP 20 ${ident(cSenha)} AS s FROM ${ident(nome)} WHERE ${ident(cSenha)} IS NOT NULL`);
      const modos = {};
      amostra.forEach((r) => { const m = detectarModo(r.s); modos[m] = (modos[m] || 0) + 1; });
      const tamanhos = [...new Set(amostra.map((r) => valorTexto(r.s).length))];
      console.log(`\nFormato da senha (coluna ${cSenha}) em ${amostra.length} usuários:`, modos, ' tamanhos:', tamanhos.join(', '));
    }

    console.log('\nSugestão para o .env:');
    console.log(`USER_TABLE=${nome}`);
    console.log(`USER_COL_LOGIN=${cLogin || '?'}`);
    console.log(`USER_COL_SENHA=${cSenha || '?'}`);
    console.log(`USER_COL_NOME=${cNome || ''}`);
    console.log(`USER_COL_ATIVO=${cAtivo ? cAtivo + '   # confira o valor que significa ativo em USER_ATIVO_VALOR' : ''}`);
    console.log('PASSWORD_MODE=auto\n');
    process.exit(0);
  } catch (e) {
    console.error('Erro:', e.message);
    process.exit(1);
  }
})();
