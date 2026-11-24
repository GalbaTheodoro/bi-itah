// Relatório: ESTOQUE (dbo.VW_estoque)
//
// Sacas e peso líquido do estoque por padrão, tipo de produto, bebida, cliente (depositante),
// armazém de depósito, status (Disponível, Warrant, Em serviço, A transferir, A sair) e próprio × terceiro.
// Cada gráfico mostra o estoque com os filtros aplicados; clicar numa barra filtra por ela.

const r2 = (n) => Math.round(n * 100) / 100;

// dimensões do relatório: campo da linha -> rótulo quando vazio
const DIMS = {
  padrao: '(sem padrão)',
  tipo: '(sem tipo)',
  bebida: '(sem bebida)',
  cliente: '(sem cliente)',
  armazem: '(sem armazém)',
  status: '(sem status)',
  tipoDom: '(sem tipo)',
};
const valor = (r, k) => r[k] || DIMS[k];

// nomes mais legíveis para o status da view
const STATUS = { DISPONIVEL: 'Disponível', WARRANT: 'Warrant', 'EN SERVICO': 'Em serviço', 'EM SERVICO': 'Em serviço', 'A TRANSFERIR': 'A transferir', 'A SAIR': 'A sair' };
const ORDEM_STATUS = ['Disponível', 'Warrant', 'Em serviço', 'A transferir', 'A sair'];
function nomeStatus(s) {
  if (!s) return null;
  const k = String(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return STATUS[k] || s;
}
const nomeDom = (s) => (!s ? null : /^propr/i.test(s) ? 'Próprio' : /^terc/i.test(s) ? 'Terceiro' : s);

// normaliza as linhas uma vez por carga do banco
const cacheNorm = new WeakMap();
function linhas(d) {
  if (!cacheNorm.has(d)) cacheNorm.set(d, d.linhas.map((r) => ({ ...r, status: nomeStatus(r.status), tipoDom: nomeDom(r.tipoDom) })));
  return cacheNorm.get(d);
}

function filtrar(lista, f) {
  return lista.filter((r) => {
    for (const k of Object.keys(DIMS)) if (f[k] && valor(r, k) !== f[k]) return false;
    return true;
  });
}

// soma por uma dimensão -> [{ nome, sacas, peso, lotes, pct }] (maior primeiro)
function agrupar(lista, k, total) {
  const m = new Map();
  for (const r of lista) {
    const n = valor(r, k);
    if (!m.has(n)) m.set(n, { nome: n, sacas: 0, peso: 0, lotes: new Set() });
    const g = m.get(n);
    g.sacas += r.sacas; g.peso += r.peso; g.lotes.add(r.lote);
  }
  let res = [...m.values()].map((g) => ({ nome: g.nome, sacas: r2(g.sacas), peso: r2(g.peso), lotes: g.lotes.size, pct: total > 0 ? r2((g.sacas / total) * 100) : 0 }));
  if (k === 'status') res.sort((a, b) => (ORDEM_STATUS.indexOf(a.nome) + 1 || 99) - (ORDEM_STATUS.indexOf(b.nome) + 1 || 99));
  else res.sort((a, b) => b.sacas - a.sacas || a.nome.localeCompare(b.nome));
  return res;
}

// tabela cruzada (sacas): linhas = dimensão a, colunas = dimensão b
function cruzar(lista, a, b, maxCol = 12) {
  const totB = new Map();
  for (const r of lista) totB.set(valor(r, b), (totB.get(valor(r, b)) || 0) + r.sacas);
  const cols = [...totB.entries()].sort((x, y) => y[1] - x[1]).map(([n]) => n);
  const mostrar = cols.slice(0, maxCol);
  const outros = cols.length > maxCol;
  const m = new Map();
  for (const r of lista) {
    const ka = valor(r, a);
    let kb = valor(r, b);
    if (!mostrar.includes(kb)) kb = 'Outros';
    if (!m.has(ka)) m.set(ka, { nome: ka, total: 0, v: {} });
    const x = m.get(ka); x.total += r.sacas; x.v[kb] = (x.v[kb] || 0) + r.sacas;
  }
  return {
    colunas: outros ? [...mostrar, 'Outros'] : mostrar,
    linhas: [...m.values()].sort((x, y) => y.total - x.total).map((x) => ({ nome: x.nome, total: r2(x.total), v: Object.fromEntries(Object.entries(x.v).map(([k, v]) => [k, r2(v)])) })),
  };
}

function opcoes(d) {
  const ls = linhas(d);
  const o = {};
  for (const k of Object.keys(DIMS)) o[k] = [...new Set(ls.map((r) => valor(r, k)))].sort((a, b) => (k === 'status' ? (ORDEM_STATUS.indexOf(a) + 1 || 99) - (ORDEM_STATUS.indexOf(b) + 1 || 99) : a.localeCompare(b, 'pt-BR')));
  return o;
}

const CRUZAMENTOS = ['padrao', 'tipo', 'bebida', 'cliente', 'armazem', 'status', 'tipoDom'];

function gerar(d, f) {
  const lista = filtrar(linhas(d), f);
  const sacas = lista.reduce((s, r) => s + r.sacas, 0);
  const peso = lista.reduce((s, r) => s + r.peso, 0);
  const porStatus = agrupar(lista, 'status', sacas);
  const porDom = agrupar(lista, 'tipoDom', sacas);
  const st = (n) => porStatus.find((x) => x.nome === n)?.sacas || 0;
  const dom = (n) => porDom.find((x) => x.nome === n)?.sacas || 0;

  // lotes: um lote pode ter mais de um status/armazém -> uma linha por combinação
  const lotes = lista.map((r) => ({ ...r, sacas: r2(r.sacas), peso: r2(r.peso) })).sort((a, b) => b.sacas - a.sacas || a.lote.localeCompare(b.lote));

  const lin = CRUZAMENTOS.includes(f.cruzarLinhas) ? f.cruzarLinhas : 'tipo';
  let col = CRUZAMENTOS.includes(f.cruzarColunas) ? f.cruzarColunas : 'bebida';
  if (col === lin) col = lin === 'bebida' ? 'tipo' : 'bebida';

  return {
    kpis: {
      sacas: r2(sacas), peso: r2(peso), lotes: new Set(lista.map((r) => r.lote)).size,
      clientes: new Set(lista.map((r) => r.cliente).filter(Boolean)).size,
      armazens: new Set(lista.map((r) => r.armazem).filter(Boolean)).size,
      disponivel: r2(st('Disponível')), warrant: r2(st('Warrant')),
      emMovimento: r2(st('Em serviço') + st('A transferir') + st('A sair')),
      proprio: r2(dom('Próprio')), terceiro: r2(dom('Terceiro')),
    },
    porPadrao: agrupar(lista, 'padrao', sacas),
    porTipo: agrupar(lista, 'tipo', sacas),
    porBebida: agrupar(lista, 'bebida', sacas),
    porCliente: agrupar(lista, 'cliente', sacas),
    porArmazem: agrupar(lista, 'armazem', sacas),
    porStatus,
    porDom,
    cruzado: { dimLinhas: lin, dimColunas: col, ...cruzar(lista, lin, col) },
    lotes,
  };
}

module.exports = { gerar, opcoes, DIMS };
