// Comparação de BEBIDA (tb_classificacao) entre dois lados: amostra × lotes, ou comprado × vendido.
//
// Regras:
//  - Amostra: cada amostra do contrato que tem bebida vale a mesma parte (média entre as amostras).
//  - Lotes: sacas de cada bebida somadas pelo volume de cada lote.
//  - Lote/amostra sem bebida fica fora da conta (aparece à parte como "sem bebida").
//  - % de cada bebida = sacas da bebida / sacas com bebida do lado.
//  - Aderência = 100 − metade da soma das diferenças absolutas (% do volume com a mesma bebida do outro lado).

const r2 = (n) => Math.round(n * 100) / 100;
const nome = (b) => (b === null || b === undefined ? '' : String(b).trim());

// amostras [{ bebida }] -> { bebida: fração 0..1 }
function fracAmostras(amostras) {
  const com = amostras.map((a) => nome(a.bebida)).filter(Boolean);
  const o = {};
  for (const b of com) o[b] = (o[b] || 0) + 1 / com.length;
  return o;
}

// lotes [{ bebida, <campo> }] -> { sacas: { bebida: sacas }, sem: sacas sem bebida }
function sacasLotes(lotes, campo = 'sacas') {
  const sacas = {};
  let sem = 0;
  for (const l of lotes) {
    const v = Number(l[campo]) || 0;
    const b = nome(l.bebida);
    if (b) sacas[b] = (sacas[b] || 0) + v; else sem += v;
  }
  return { sacas, sem };
}

// soma um mapa em outro, com fator
function somarEm(dest, src, fator = 1) {
  for (const [k, v] of Object.entries(src || {})) dest[k] = (dest[k] || 0) + v * fator;
  return dest;
}

const total = (m) => Object.values(m || {}).reduce((s, v) => s + v, 0);

// Compara os dois lados.  a / b = { bebida: peso ou sacas }.
// escalarA: o lado A vira "sacas esperadas" = % de A × total de B (amostra × lotes).
function comparar(a, b, { escalarA = false } = {}) {
  const tA = total(a), tB = total(b);
  const bebidas = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];
  const linhas = bebidas.map((x) => {
    const pA = tA > 0 ? ((a[x] || 0) / tA) * 100 : 0;
    const pB = tB > 0 ? ((b[x] || 0) / tB) * 100 : 0;
    const sA = escalarA ? (tB * pA) / 100 : a[x] || 0;
    return {
      bebida: x,
      pctA: tA > 0 ? r2(pA) : null, pctB: tB > 0 ? r2(pB) : null,
      diferenca: tA > 0 && tB > 0 ? r2(pB - pA) : null,
      sacasA: r2(sA), sacasB: r2(b[x] || 0),
      _dif: pB - pA,
    };
  }).sort((x, y) => Math.max(y.pctA || 0, y.pctB || 0) - Math.max(x.pctA || 0, x.pctB || 0) || x.bebida.localeCompare(y.bebida));
  let aderencia = null;
  if (tA > 0 && tB > 0) {
    let s = 0;
    for (const l of linhas) s += Math.abs(l._dif);
    aderencia = r2(100 - s / 2);
  }
  for (const l of linhas) delete l._dif;
  return { linhas, aderencia };
}

module.exports = { fracAmostras, sacasLotes, somarEm, comparar, total, nome, r2 };
