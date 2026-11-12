// Acesso de cada usuário a cada relatório (BI).
// Onde guarda as liberações:
//  - no computador: config/acessos.json
//  - na Vercel (ou ACESSOS_NO_BANCO=1): tabela BI_ACESSOS no banco (criada sozinha na primeira vez),
//    porque lá o disco não guarda arquivos.
// Administradores (ADMIN_USUARIOS no .env, padrão "ADM") veem tudo e liberam os outros.
const fs = require('fs');
const path = require('path');

const ARQ = path.join(__dirname, '..', 'config', 'acessos.json');
const NO_BANCO = !!process.env.VERCEL || process.env.ACESSOS_NO_BANCO === '1';

const RELATORIOS = [
  { id: 'comparativo', titulo: 'Amostra × Entrada', api: '/api/comparativo' },
  { id: 'gs', titulo: 'GS: Despejado × Resultado', api: '/api/gs' },
  { id: 'compravenda', titulo: 'Comprado × Vendido', api: '/api/cv' },
  { id: 'lucro', titulo: 'Lucro por lote', api: '/api/lucro' },
];
const IDS = RELATORIOS.map((r) => r.id);

const norm = (s) => String(s || '').trim().toLowerCase();
function admins() { return (process.env.ADMIN_USUARIOS || 'ADM').split(',').map(norm).filter(Boolean); }
function ehAdmin(login) { return admins().includes(norm(login)); }

let db = null;
function usarBanco(conexao) { db = conexao; }

// ---------- armazenamento ----------
let tabelaOk = false;
async function garantirTabela() {
  if (tabelaOk) return;
  await db.query(`IF OBJECT_ID('dbo.BI_ACESSOS', 'U') IS NULL
    CREATE TABLE dbo.BI_ACESSOS (Login NVARCHAR(50) NOT NULL, Relatorio NVARCHAR(50) NOT NULL,
      AlteradoPor NVARCHAR(50) NULL, AlteradoEm DATETIME NOT NULL DEFAULT GETDATE(),
      CONSTRAINT PK_BI_ACESSOS PRIMARY KEY (Login, Relatorio))`);
  tabelaOk = true;
}

const cache = { dados: null, quando: 0 };
async function ler() {
  if (cache.dados && Date.now() - cache.quando < 30000) return cache.dados;
  let dados;
  if (NO_BANCO) {
    await garantirTabela();
    const rows = await db.query('SELECT Login, Relatorio, AlteradoPor, AlteradoEm FROM dbo.BI_ACESSOS');
    dados = { usuarios: {}, alterado: null };
    for (const r of rows) {
      const k = norm(r.Login);
      (dados.usuarios[k] = dados.usuarios[k] || []).push(r.Relatorio);
      if (!dados.alterado || r.AlteradoEm > new Date(dados.alterado.em)) dados.alterado = { por: r.AlteradoPor, em: new Date(r.AlteradoEm).toISOString() };
    }
  } else {
    try { dados = JSON.parse(fs.readFileSync(ARQ, 'utf8')); } catch (_) { dados = { usuarios: {} }; }
  }
  cache.dados = dados; cache.quando = Date.now();
  return dados;
}

async function permitidos(login) {
  if (ehAdmin(login)) return [...IDS];
  const lista = (await ler()).usuarios[norm(login)] || [];
  return IDS.filter((id) => lista.includes(id));
}

async function definir(login, ids, quem) {
  const k = norm(login);
  const novos = [...new Set(ids)].filter((x) => IDS.includes(x));
  if (NO_BANCO) {
    await garantirTabela();
    await db.query('DELETE FROM dbo.BI_ACESSOS WHERE Login = @login', { login: k });
    for (const r of novos) {
      await db.query('INSERT INTO dbo.BI_ACESSOS (Login, Relatorio, AlteradoPor) VALUES (@login, @rel, @quem)', { login: k, rel: r, quem: String(quem || '') });
    }
  } else {
    const d = await ler();
    d.usuarios = d.usuarios || {};
    d.usuarios[k] = novos;
    d.alterado = { por: quem, em: new Date().toISOString() };
    fs.mkdirSync(path.dirname(ARQ), { recursive: true });
    fs.writeFileSync(ARQ + '.tmp', JSON.stringify(d, null, 2));
    fs.renameSync(ARQ + '.tmp', ARQ);
  }
  cache.dados = null;
  return novos;
}

// Middleware: bloqueia a API de um relatório que o usuário não tem liberado
async function protegerRelatorios(req, res, next) {
  const r = RELATORIOS.find((x) => req.path === x.api || req.path.startsWith(x.api + '/'));
  if (!r) return next();
  try {
    if ((await permitidos(req.session?.usuario?.login)).includes(r.id)) return next();
    return res.status(403).json({ erro: 'Você não tem acesso a este relatório. Peça ao administrador para liberar.' });
  } catch (e) { next(e); }
}

function exigirAdmin(req, res, next) {
  if (ehAdmin(req.session?.usuario?.login)) return next();
  return res.status(403).json({ erro: 'Só o administrador pode liberar acessos.' });
}

module.exports = { RELATORIOS, ehAdmin, permitidos, definir, ler, protegerRelatorios, exigirAdmin, usarBanco, NO_BANCO };
