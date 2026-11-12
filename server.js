// Ponto de entrada (computador e Vercel).
// Se algo falhar ao iniciar, em vez da página preta da Vercel mostra o erro na tela para corrigir.
const express = require('express');

let app;
try {
  app = require('./servidor');
} catch (e) {
  console.error('Erro ao iniciar o BI:', e);
  app = express();
  app.use((req, res) => res.status(500).type('text/plain; charset=utf-8').send('Erro ao iniciar o BI Itah:\n\n' + (e && e.stack ? e.stack : String(e))));
}

module.exports = app;
