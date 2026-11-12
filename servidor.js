require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const db = require('./src/db');
const auth = require('./src/auth');
const acessos = require('./src/acessos');
acessos.usarBanco(db);
const fontes = require('./src/fontes');
const comparativo = require('./src/relatorios/comparativo');
const relGS = require('./src/relatorios/gs');
const relCV = require('./src/relatorios/compravenda');
const relLucro = require('./src/relatorios/lucro');

const DEMO = process.argv.includes('--demo') || process.env.DEMO === '1';
// No modo demonstração o usuário demo é administrador
if (DEMO) process.env.ADMIN_USUARIOS = [process.env.ADMIN_USUARIOS || 'ADM', 'demo'].join(',');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.VERCEL ? true : 1);
app.use(express.json({ limit: '100kb' }));

if (!process.env.SESSION_SECRET && !DEMO) {
  console.warn('AVISO: defina SESSION_SECRET no arquivo .env');
}
// Sessão guardada num cookie assinado (funciona no computador e na Vercel, que não guarda memória entre acessos)
app.use(cookieSession({
  name: 'bi_itah',
  keys: [process.env.SESSION_SECRET || 'demo-secret-troque'],
  httpOnly: true,
  sameSite: 'lax',
  secure: !!process.env.VERCEL,
  maxAge: (Number(process.env.SESSION_HORAS) || 10) * 3600 * 1000,
}));

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// ---------- Rotas públicas ----------
// Diagnóstico rápido (sem senhas): abre /api/saude no navegador
app.get('/api/saude', (req, res) => res.json({
  ok: true, vercel: !!process.env.VERCEL, node: process.version, https: req.secure,
  variaveis: ['DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD', 'SESSION_SECRET', 'USER_TABLE', 'USER_COL_LOGIN', 'USER_COL_SENHA']
    .map((k) => `${k}: ${process.env[k] ? 'ok' : 'FALTANDO'}`),
}));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/img', express.static(path.join(__dirname, 'public', 'img')));
app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').sendFile(path.join(__dirname, 'public', 'manifest.webmanifest')));
app.get('/sw.js', (req, res) => { res.set('Cache-Control', 'no-cache'); res.type('application/javascript').sendFile(path.join(__dirname, 'public', 'sw.js')); });
app.get('/js/instalar.js', (req, res) => res.sendFile(path.join(__dirname, 'public', 'js', 'instalar.js')));
app.get('/js/login.js', (req, res) => res.sendFile(path.join(__dirname, 'public', 'js', 'login.js')));
app.get('/vendor/chart.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules', 'chart.js', 'dist', 'chart.umd.js')));

app.post('/api/login', async (req, res) => {
  const login = String(req.body?.login || '').trim();
  const senha = String(req.body?.senha || '');
  if (!login || !senha) return res.status(400).json({ erro: 'Informe usuário e senha.' });
  const chave = `${req.ip}|${login.toLowerCase()}`;
  if (auth.bloqueado(chave)) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos.' });
  try {
    let usuario = null;
    if (DEMO) usuario = login === 'demo' && senha === 'demo' ? { login: 'demo', nome: 'Usuário demonstração' } : null;
    else usuario = await auth.autenticar(db, login, senha);
    if (!usuario) {
      auth.registrarErro(chave);
      return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
    }
    auth.limpar(chave);
    req.session = { usuario };
    res.json({ ok: true, usuario });
  } catch (err) {
    console.error('Erro no login:', err.message);
    res.status(500).json({ erro: 'Não foi possível validar o login (veja o console do servidor).' });
  }
});

app.post('/api/logout', (req, res) => { req.session = null; res.json({ ok: true }); });

// ---------- Daqui para baixo exige login ----------
app.use(auth.exigirLogin);

app.get('/api/me', async (req, res, next) => {
  try {
    res.json({
      usuario: req.session.usuario, demo: DEMO,
      admin: acessos.ehAdmin(req.session.usuario.login),
      permitidos: await acessos.permitidos(req.session.usuario.login),
    });
  } catch (e) { next(e); }
});

// ----- Acessos por usuário (só administrador) -----
app.get('/api/acessos', acessos.exigirAdmin, async (req, res, next) => {
  try {
    let usuarios;
    if (DEMO) usuarios = [{ login: 'demo', ativo: true }, { login: 'usuario1', ativo: true }];
    else {
      const cLogin = auth.ident(process.env.USER_COL_LOGIN || 'Usuario');
      const cAtivo = auth.ident(process.env.USER_COL_ATIVO);
      usuarios = await db.query(`SELECT ${cLogin} AS login${cAtivo ? `, ${cAtivo} AS ativo` : ''} FROM ${auth.ident(process.env.USER_TABLE || 'TB_USUARIO')} ORDER BY ${cLogin}`);
    }
    const d = await acessos.ler();
    const lista = [];
    for (const u of usuarios) {
      const login = String(u.login).trim();
      lista.push({ login, ativo: u.ativo === undefined ? true : u.ativo === true || u.ativo === 1, admin: acessos.ehAdmin(login), permitidos: await acessos.permitidos(login) });
    }
    res.json({
      relatorios: acessos.RELATORIOS.map(({ id, titulo }) => ({ id, titulo })),
      usuarios: lista,
      alterado: d.alterado || null,
    });
  } catch (e) { next(e); }
});

app.post('/api/acessos', acessos.exigirAdmin, async (req, res, next) => {
  const login = String(req.body?.login || '').trim();
  const ids = Array.isArray(req.body?.relatorios) ? req.body.relatorios.map(String) : null;
  if (!login || !ids) return res.status(400).json({ erro: 'Informe login e relatorios.' });
  if (acessos.ehAdmin(login)) return res.status(400).json({ erro: 'Administrador já tem acesso a tudo.' });
  try { res.json({ ok: true, permitidos: await acessos.definir(login, ids, req.session.usuario.login) }); } catch (e) { next(e); }
});

app.use(acessos.protegerRelatorios);

function lerFiltros(q) {
  const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
  return {
    de: data(q.de), ate: data(q.ate),
    base: q.base === 'entrada' ? 'entrada' : 'contrato',
    fornecedor: q.fornecedor || null,
    armazem: q.armazem || null,
    contrato: q.contrato || null,
    somenteComEntrada: q.todos !== '1',
  };
}

app.get('/api/comparativo/opcoes', async (req, res, next) => {
  try {
    const dados = await fontes.carregar({ demo: DEMO, db });
    res.json({ ...comparativo.opcoes(dados), atualizadoEm: dados.atualizadoEm });
  } catch (e) { next(e); }
});

app.get('/api/comparativo', async (req, res, next) => {
  try {
    const dados = await fontes.carregar({ demo: DEMO, db, forcar: req.query.atualizar === '1' });
    res.json({ ...comparativo.gerar(dados, lerFiltros(req.query)), atualizadoEm: dados.atualizadoEm });
  } catch (e) { next(e); }
});

// ----- Relatório 2: Guia de Serviço -----
app.get('/api/gs/opcoes', async (req, res, next) => {
  try {
    const dados = await fontes.carregarGS({ demo: DEMO, db });
    res.json({ ...relGS.opcoes(dados), atualizadoEm: dados.atualizadoEm });
  } catch (e) { next(e); }
});

app.get('/api/gs', async (req, res, next) => {
  try {
    const dados = await fontes.carregarGS({ demo: DEMO, db, forcar: req.query.atualizar === '1' });
    const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
    const cob = Number(req.query.cobertura);
    const f = { de: data(req.query.de), ate: data(req.query.ate), armazem: req.query.armazem || null, gs: req.query.gs || null,
      cobertura: Number.isFinite(cob) && req.query.cobertura !== '' ? Math.min(100, Math.max(0, cob)) : 80 };
    res.json({ ...relGS.gerar(dados, f), atualizadoEm: dados.atualizadoEm });
  } catch (e) { next(e); }
});

// ----- Relatório 3: Compra x Venda por peneira -----
async function dadosCV(forcar) {
  const [compras, vendas] = await Promise.all([fontes.carregar({ demo: DEMO, db, forcar }), fontes.carregarVendas({ demo: DEMO, db, forcar })]);
  return { compras, vendas };
}
app.get('/api/cv/opcoes', async (req, res, next) => {
  try { const { compras, vendas } = await dadosCV(false); res.json(relCV.opcoes(compras, vendas)); } catch (e) { next(e); }
});
app.get('/api/cv', async (req, res, next) => {
  try {
    const { compras, vendas } = await dadosCV(req.query.atualizar === '1');
    const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
    const f = { de: data(req.query.de), ate: data(req.query.ate), base: req.query.base === 'fisico' ? 'fisico' : 'contratado',
      fornecedor: req.query.fornecedor || null, cliente: req.query.cliente || null, vendaPor: req.query.vendaPor === 'tipo' ? 'tipo' : 'peneira' };
    res.json({ ...relCV.gerar(compras, vendas, f), atualizadoEm: vendas.atualizadoEm });
  } catch (e) { next(e); }
});

// ----- Relatório 4: Lucro por lote vendido (rastreabilidade até as GR) -----
app.get('/api/lucro', async (req, res, next) => {
  try {
    if (DEMO) return res.status(400).json({ erro: 'Este relatório precisa do banco (não tem preço nos dados de demonstração). Use o iniciar.bat.' });
    const d = await fontes.carregarRastreio({ db, forcar: req.query.atualizar === '1' });
    const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
    const dolar = Number(String(req.query.dolar || process.env.DOLAR || '').replace(',', '.'));
    const f = { de: data(req.query.de), ate: data(req.query.ate), cliente: req.query.cliente || null, id: req.query.id || null, dolar: dolar > 0 ? dolar : null };
    res.json({ ...relLucro.gerar(d, f), opcoes: relLucro.opcoes(d), atualizadoEm: d.atualizadoEm });
  } catch (e) { next(e); }
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro ao consultar os dados: ' + err.message });
});

// Na Vercel o app é exportado (sem listen) e o disco é só leitura
module.exports = app;

// No computador: sobe o servidor. Na Vercel quem chama o app é a própria Vercel.
if (!process.env.VERCEL) {

  const PORT = Number(process.env.PORT) || 3000;
  // Ao iniciar ligado no banco, grava explorar.txt (consultas só de leitura da estrutura) para ajudar a configurar relatórios
  if (!DEMO) {
    const { execFile } = require('child_process');
    execFile(process.execPath, [path.join(__dirname, 'scripts', 'explorar.js')], { cwd: __dirname, timeout: 120000, maxBuffer: 20 * 1024 * 1024 }, (err, out, errOut) => {
      try { require('fs').writeFileSync(path.join(__dirname, 'explorar.txt'), (out || '') + (errOut || '') + (err ? '\nERRO: ' + err.message : '')); } catch (_) {}
    });
  }

  const servidor = app.listen(PORT, () => {
    console.log(`BI Itah rodando em http://localhost:${PORT}${DEMO ? '  (MODO DEMO - login demo / demo)' : ''}`);
  });
  servidor.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nA porta ${PORT} ja esta em uso: o BI Itah provavelmente ja esta aberto em outra janela.`);
      console.error('Feche a outra janela preta e rode de novo, ou troque PORT no arquivo .env.\n');
    } else console.error(err);
    process.exit(1);
  });
}
