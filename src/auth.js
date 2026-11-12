const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Só aceita nomes simples de tabela/coluna (evita SQL injection na configuração)
function ident(name) {
  if (!name) return null;
  const parts = String(name).replace(/[\[\]]/g, '').split('.');
  for (const p of parts) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) throw new Error(`Nome inválido na configuração: ${name}`);
  }
  return parts.map((p) => `[${p}]`).join('.');
}

function valorTexto(v) {
  if (v === null || v === undefined) return '';
  if (Buffer.isBuffer(v)) return v.toString('hex'); // senha guardada como varbinary (HASHBYTES)
  return String(v).trim();
}

function hash(alg, senha, enc) {
  return crypto.createHash(alg).update(Buffer.from(senha, enc)).digest('hex');
}

const HEX = { 32: 'md5', 40: 'sha1', 64: 'sha256', 128: 'sha512' };

function detectarModo(guardada) {
  const s = valorTexto(guardada);
  if (/^\$2[aby]\$/.test(s)) return 'bcrypt';
  const h = s.replace(/^0x/i, '');
  if (/^[0-9a-f]+$/i.test(h) && HEX[h.length]) return HEX[h.length];
  return 'plain';
}

function igual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function conferirSenha(digitada, guardada, modo = 'auto') {
  const s = valorTexto(guardada);
  if (!s) return false;
  const m = modo === 'auto' ? detectarModo(guardada) : modo;
  if (m === 'bcrypt') return bcrypt.compareSync(digitada, s);
  if (m === 'plain') return igual(digitada, s);
  const alvo = s.replace(/^0x/i, '').toLowerCase();
  // SQL Server HASHBYTES em varchar ~ latin1; em nvarchar = utf16le; sistemas web = utf8
  for (const enc of ['utf8', 'latin1', 'utf16le']) {
    if (igual(hash(m, digitada, enc), alvo)) return true;
  }
  return false;
}

async function autenticar(db, login, senha) {
  const t = ident(process.env.USER_TABLE || 'TB_USUARIO');
  const cLogin = ident(process.env.USER_COL_LOGIN || 'Usuario');
  const cSenha = ident(process.env.USER_COL_SENHA || 'Senha');
  const cNome = ident(process.env.USER_COL_NOME) || cLogin;
  const cAtivo = ident(process.env.USER_COL_ATIVO);

  const rows = await db.query(
    `SELECT TOP 1 ${cLogin} AS login, ${cSenha} AS senha, ${cNome} AS nome${cAtivo ? `, ${cAtivo} AS ativo` : ''}
       FROM ${t} WHERE ${cLogin} = @login`,
    { login }
  );
  const u = rows[0];
  if (!u) return null;
  if (cAtivo && String(u.ativo) !== String(process.env.USER_ATIVO_VALOR ?? '1') && u.ativo !== true) return null;
  if (!conferirSenha(senha, u.senha, (process.env.PASSWORD_MODE || 'auto').toLowerCase())) return null;
  return { login: String(u.login).trim(), nome: String(u.nome ?? u.login).trim() };
}

// Bloqueio simples contra tentativa de força bruta: 8 erros em 15 min por IP+login
const tentativas = new Map();
function bloqueado(chave) {
  const t = tentativas.get(chave);
  if (!t) return false;
  if (Date.now() - t.inicio > 15 * 60 * 1000) { tentativas.delete(chave); return false; }
  return t.n >= 8;
}
function registrarErro(chave) {
  const t = tentativas.get(chave);
  if (!t || Date.now() - t.inicio > 15 * 60 * 1000) tentativas.set(chave, { n: 1, inicio: Date.now() });
  else t.n++;
}
function limpar(chave) { tentativas.delete(chave); }

function exigirLogin(req, res, next) {
  if (req.session && req.session.usuario) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  return res.redirect('/login.html');
}

module.exports = { autenticar, conferirSenha, detectarModo, valorTexto, ident, exigirLogin, bloqueado, registrarErro, limpar };
