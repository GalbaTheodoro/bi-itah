// Dados da empresa (TB_EMPRESA) para o cabeçalho dos relatórios impressos/PDF.
// As colunas são descobertas no próprio banco (INFORMATION_SCHEMA), então funciona mesmo que os
// nomes variem. Para forçar um nome de coluna, use no .env: EMPRESA_COL_<CAMPO>=NomeDaColuna
// (ex.: EMPRESA_COL_LOGO=Logotipo). Empresa padrão (quando o relatório não informa): EMPRESA_ID=1

// campo -> padrões de nome de coluna, na ordem de preferência
const PADROES = {
  id: [/^id$/i, /^idempresa$/i, /^codigo$/i],
  razao: [/raz[aã]o/i, /^nome$/i, /^empresa$/i, /^nomeempresa$/i, /^descricao$/i],
  fantasia: [/fantasia/i, /^apelido$/i],
  cnpj: [/^cnpj$/i, /cnpj/i, /^cgc$/i, /^cpfcnpj$/i, /^documento$/i],
  ie: [/^ie$/i, /insc.*est/i, /^inscricao$/i],
  endereco: [/^endereco$/i, /^logradouro$/i, /^rua$/i, /^end$/i],
  numero: [/^numero$/i, /^nro$/i, /^num$/i, /^numeroend/i],
  complemento: [/^complemento$/i],
  bairro: [/^bairro$/i],
  cidade: [/^cidade$/i, /^municipio$/i, /^nomecidade$/i],
  uf: [/^uf$/i, /^estado$/i, /^siglauf$/i],
  cep: [/^cep$/i],
  telefone: [/^telefone\d*$/i, /^fone\d*$/i, /^tel\d*$/i, /^telefones$/i],
  email: [/^e-?mail$/i, /^email\d*$/i],
  site: [/^site$/i, /^homepage$/i, /^url$/i],
  logo: [/^logo/i, /logo/i, /^imagem/i, /^foto/i, /marca/i],
};
const TIPOS_TEXTO = /char|text/i;
const TIPOS_BIN = /binary|image/i;

let mapa = null;          // { campo: coluna }
let todasColunas = [];
const cache = new Map();  // id -> { quando, dados }
const TTL = 60 * 60 * 1000;

async function descobrir(db) {
  if (mapa) return mapa;
  const cols = await db.query(
    `SELECT COLUMN_NAME AS nome, DATA_TYPE AS tipo FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TB_EMPRESA' ORDER BY ORDINAL_POSITION`);
  if (!cols.length) throw new Error('Tabela TB_EMPRESA não encontrada.');
  todasColunas = cols;
  const m = {};
  for (const [campo, regs] of Object.entries(PADROES)) {
    const forcada = process.env['EMPRESA_COL_' + campo.toUpperCase()];
    if (forcada) { const c = cols.find((x) => x.nome.toLowerCase() === forcada.toLowerCase()); if (c) { m[campo] = c.nome; continue; } }
    for (const re of regs) {
      const c = cols.find((x) => re.test(x.nome) && !Object.values(m).includes(x.nome) &&
        (campo === 'id' ? true
          : campo === 'logo' ? TIPOS_BIN.test(x.tipo) || TIPOS_TEXTO.test(x.tipo)
            : TIPOS_TEXTO.test(x.tipo))); // cidade/uf como código (int) não serve para imprimir
      if (c) { m[campo] = c.nome; break; }
    }
  }
  // sem coluna com nome de logo: usa a primeira coluna binária da tabela
  if (!m.logo) { const b = cols.find((x) => TIPOS_BIN.test(x.tipo)); if (b) m.logo = b.nome; }
  if (!m.id) m.id = cols[0].nome;
  mapa = m;
  return mapa;
}

// imagem (bytes ou texto) -> data URL que o navegador mostra
function imagem(v) {
  if (v === null || v === undefined) return null;
  let buf;
  if (Buffer.isBuffer(v)) buf = v;
  else {
    const s = String(v).trim();
    if (!s) return null;
    if (s.startsWith('data:image')) return s;
    if (/^https?:\/\//i.test(s)) return s;                       // endereço de imagem
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(s) && s.length > 100) buf = Buffer.from(s.replace(/\s/g, ''), 'base64');
    else return null;                                            // caminho de arquivo local não dá para usar no navegador
  }
  if (!buf || buf.length < 8) return null;
  const h = buf.subarray(0, 12);
  let tipo = null;
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) tipo = 'image/png';
  else if (h[0] === 0xff && h[1] === 0xd8) tipo = 'image/jpeg';
  else if (h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46) tipo = 'image/gif';
  else if (h[0] === 0x42 && h[1] === 0x4d) tipo = 'image/bmp';
  else if (h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WEBP') tipo = 'image/webp';
  else if (buf.subarray(0, 200).toString('utf8').includes('<svg')) tipo = 'image/svg+xml';
  if (!tipo) {
    // Delphi/Access às vezes guardam a imagem com um cabeçalho na frente: procura a assinatura PNG/JPEG
    const iP = buf.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47])), iJ = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
    const i = [iP, iJ].filter((x) => x >= 0 && x < 512).sort((a, b) => a - b)[0];
    if (i === undefined) return null;
    return imagem(buf.subarray(i));
  }
  return `data:${tipo};base64,${buf.toString('base64')}`;
}

const limpo = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());

function formatarDoc(v) {
  const d = limpo(v).replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return limpo(v);
}

function montar(r, m) {
  const g = (c) => (m[c] ? limpo(r[m[c]]) : '');
  const cidadeUf = [g('cidade'), g('uf')].filter(Boolean).join(' / ');
  const end = [[g('endereco'), g('numero')].filter(Boolean).join(', '), g('complemento'), g('bairro'), cidadeUf, g('cep') ? 'CEP ' + g('cep') : '']
    .filter(Boolean).join(' · ');
  return {
    id: r[m.id],
    razao: g('razao') || g('fantasia') || 'Empresa',
    fantasia: g('fantasia') && g('fantasia') !== g('razao') ? g('fantasia') : '',
    cnpj: m.cnpj ? formatarDoc(r[m.cnpj]) : '',
    ie: g('ie'),
    endereco: end,
    telefone: g('telefone'),
    email: g('email'),
    site: g('site'),
    logo: m.logo ? imagem(r[m.logo]) : null,
  };
}

// Busca uma ou mais empresas; ids vazio -> empresa padrão (EMPRESA_ID ou a de menor ID)
async function buscar(db, ids = []) {
  const m = await descobrir(db);
  ids = [...new Set(ids.map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 10);
  if (!ids.length) ids = [Number(process.env.EMPRESA_ID) || 0];
  const out = [];
  for (const id of ids) {
    const c = cache.get(id);
    if (c && Date.now() - c.quando < TTL) { out.push(c.dados); continue; }
    const cols = [...new Set(Object.values(m))].map((c) => `[${c}]`).join(', ');
    const rows = id > 0
      ? await db.query(`SELECT TOP 1 ${cols} FROM TB_EMPRESA WHERE [${m.id}] = @id`, { id })
      : await db.query(`SELECT TOP 1 ${cols} FROM TB_EMPRESA ORDER BY [${m.id}]`);
    if (!rows.length) continue;
    const dados = montar(rows[0], m);
    cache.set(id, { quando: Date.now(), dados });
    if (id === 0) cache.set(Number(dados.id), { quando: Date.now(), dados });
    out.push(dados);
  }
  return out;
}

// Para conferir o que foi encontrado (admin): GET /api/empresa?colunas=1
async function diagnostico(db) {
  const m = await descobrir(db);
  return { campos: m, colunas: todasColunas };
}

function demo() {
  return [{ id: 1, razao: 'Itah Trading (demonstração)', fantasia: '', cnpj: '00.000.000/0001-00', ie: '', endereco: 'Endereço da empresa · Cidade / UF',
    telefone: '', email: '', site: '', logo: '/img/logo.png' }];
}

// Junta os IDEmpresa distintos de várias listas de linhas
function idsEmpresa(...listas) {
  const s = new Set();
  for (const l of listas) for (const r of l || []) { const v = Number(r && r.idEmpresa); if (v > 0) s.add(v); }
  return [...s].sort((a, b) => a - b);
}

module.exports = { buscar, diagnostico, demo, idsEmpresa, imagem };
