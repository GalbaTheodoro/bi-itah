// Roda as consultas de scripts/explorar.sql (separadas por linhas "GO") e grava o resultado em explorar.txt.
// Só aceita SELECT (somente leitura).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

(async () => {
  const txt = fs.readFileSync(path.join(__dirname, 'explorar.sql'), 'utf8');
  const blocos = txt.split(/^\s*GO\s*$/im).map((s) => s.trim()).filter(Boolean);
  for (const sqlText of blocos) {
    const semComent = sqlText.replace(/--.*$/gm, '');
    console.log('\n===== ' + (sqlText.split('\n')[0].startsWith('--') ? sqlText.split('\n')[0].slice(2).trim() : semComent.slice(0, 80).replace(/\s+/g, ' ')));
    if (/\b(insert|update|delete|drop|alter|create|exec|execute|merge|truncate|grant)\b/i.test(semComent)) { console.log('IGNORADO: só SELECT'); continue; }
    try {
      const rows = await db.query(semComent);
      console.log(`(${rows.length} linhas)`);
      if (rows.length) {
        const cols = Object.keys(rows[0]);
        console.log(cols.join(' | '));
        rows.slice(0, 60).forEach((r) => console.log(cols.map((c) => { const v = r[c]; return v instanceof Date ? v.toISOString().slice(0, 10) : v === null ? 'NULL' : String(v).trim(); }).join(' | ')));
      }
    } catch (e) { console.log('ERRO:', e.message); }
  }
  process.exit(0);
})();
