// Exportar o relatório aberto: PDF (impressão do navegador) e Excel (.xlsx).
// Vale para todos os relatórios: pega os filtros, as tabelas e os gráficos que estão na tela.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const titulo = () => ($('#conteudo h1')?.textContent || $('#titulo-pagina')?.textContent || 'Relatório').trim();
  const agora = () => new Date().toLocaleString('pt-BR');
  const nomeArquivo = (ext) => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const base = titulo().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    return `${base} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}.${ext}`;
  };

  // Filtros da tela: [[rótulo, valor]] — com todos=true, campo vazio aparece como "Todos"
  function filtros(todos = false) {
    const out = [];
    $$('#conteudo .filtros label').forEach((l) => {
      const campo = l.querySelector('input, select');
      if (!campo) return;
      const rot = [...l.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim() || campo.name || '';
      let v = '';
      if (campo.type === 'checkbox') v = campo.checked ? 'Sim' : '';
      else if (campo.tagName === 'SELECT') v = campo.value ? campo.selectedOptions[0]?.textContent.trim() : '';
      else if (campo.type === 'date') v = campo.value ? campo.value.split('-').reverse().join('/') : '';
      else v = campo.value.trim();
      if (v) out.push([rot, v]);
      else if (todos) out.push([rot, campo.type === 'checkbox' ? 'Não' : 'Todos']);
    });
    $$('#conteudo input.busca').forEach((b) => { if (b.value.trim()) out.push(['Busca', b.value.trim()]); });
    const aba = $('#conteudo .abas button.ativo');
    if (aba) out.unshift(['Visão', aba.textContent.trim()]);
    return out;
  }

  // ---------------- Empresa (TB_EMPRESA) ----------------
  // Os relatórios devolvem "empresas" (IDEmpresa dos dados filtrados); sem isso usa a empresa padrão.
  let idsAtuais = null;
  const cacheEmp = new Map(); // "1,2" -> { promessa, dados }
  function carregarEmpresas() {
    const k = (idsAtuais && idsAtuais.length ? idsAtuais : []).join(',');
    if (!cacheEmp.has(k)) {
      const item = { dados: null };
      item.promessa = fetch('/api/empresa' + (k ? '?ids=' + k : ''), { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : { empresas: [] })).then((j) => (item.dados = j.empresas || []))
        .catch(() => { cacheEmp.delete(k); return (item.dados = []); });
      cacheEmp.set(k, item);
    }
    return cacheEmp.get(k);
  }
  window.addEventListener('bi:empresas', (e) => { idsAtuais = e.detail; carregarEmpresas(); });
  const empresasProntas = () => carregarEmpresas().dados;

  function cabecalhoEmpresa(lista) {
    const emp = (lista || [])[0];
    if (!emp) return `<div class="pc-emp"><img src="/img/logo.png" alt=""><div><b>BI Itah</b></div></div>`;
    const doc = [emp.cnpj && 'CNPJ ' + emp.cnpj, emp.ie && 'IE ' + emp.ie].filter(Boolean).join(' · ');
    const cont = [emp.telefone, emp.email, emp.site].filter(Boolean).join(' · ');
    const outras = lista.slice(1).map((x) => x.razao);
    return `<div class="pc-emp">${emp.logo ? `<img src="${BI.esc(emp.logo)}" alt="">` : ''}
      <div><b>${BI.esc(emp.razao)}</b>${emp.fantasia ? `<small>${BI.esc(emp.fantasia)}</small>` : ''}
      ${doc ? `<span>${BI.esc(doc)}</span>` : ''}${emp.endereco ? `<span>${BI.esc(emp.endereco)}</span>` : ''}${cont ? `<span>${BI.esc(cont)}</span>` : ''}
      ${outras.length ? `<span class="pc-outras">Também neste relatório: ${BI.esc(outras.join('; '))}</span>` : ''}</div></div>`;
  }

  // ---------------- PDF (imprimir) ----------------
  let preparado = false, tituloAntes = '';
  function antesImprimir() {
    if (preparado) return;
    preparado = true;
    // gráficos viram imagem: saem nítidos e do tamanho da folha
    $$('#conteudo canvas').forEach((c) => {
      try {
        const img = document.createElement('img');
        img.className = 'print-img'; img.src = c.toDataURL('image/png'); img.alt = '';
        c.after(img);
      } catch (_) {}
    });
    const f = filtros(true);
    const cab = document.createElement('div');
    cab.className = 'print-cab';
    cab.innerHTML = `${cabecalhoEmpresa(empresasProntas())}
      <div class="pc-info"><b>${BI.esc(titulo())}</b><span>${BI.esc($('#titulo-grupo')?.textContent || '')}</span>
        <span>Emitido em ${BI.esc(agora())}</span><span>por ${BI.esc($('#usuario')?.textContent.replace('DEMO', '').trim() || '')}</span></div>
      <div class="pc-filtros"><b>Filtros aplicados</b>${f.length
        ? f.map(([k, v]) => `<span><em>${BI.esc(k)}</em> ${BI.esc(v)}</span>`).join('')
        : '<span>Nenhum filtro (todos os dados)</span>'}</div>`;
    $('#conteudo').prepend(cab);
    tituloAntes = document.title;
    document.title = nomeArquivo('pdf').replace(/\.pdf$/, ''); // vira o nome sugerido do PDF
  }
  function depoisImprimir() {
    if (!preparado) return;
    preparado = false;
    $$('#conteudo .print-img, #conteudo .print-cab').forEach((e) => e.remove());
    if (tituloAntes) document.title = tituloAntes;
  }
  window.addEventListener('beforeprint', antesImprimir); // também no Ctrl+P
  window.addEventListener('afterprint', depoisImprimir);
  async function pdf() {
    const b = $('#btn-pdf'), txt = b?.innerHTML;
    if (b) { b.disabled = true; b.textContent = 'Preparando…'; }
    try {
      // dados da empresa (no máximo 5 s esperando o servidor)
      await Promise.race([carregarEmpresas().promessa, new Promise((r) => setTimeout(r, 5000))]);
      antesImprimir();
      // espera logo e imagens dos gráficos carregarem antes de abrir a janela de impressão
      await Promise.all($$('#conteudo .print-img, #conteudo .print-cab img').map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
      await new Promise((r) => setTimeout(r, 50));
    } finally { if (b) { b.disabled = false; b.innerHTML = txt; } }
    window.print();
  }

  // ---------------- Excel ----------------
  let carregandoXlsx = null;
  function xlsxLib() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!carregandoXlsx) carregandoXlsx = new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = '/vendor/xlsx.mini.min.js';
      s.onload = () => ok(window.XLSX);
      s.onerror = () => { carregandoXlsx = null; erro(new Error('Não consegui carregar o gerador de Excel.')); };
      document.head.appendChild(s);
    });
    return carregandoXlsx;
  }

  // Texto da tela -> valor de célula (números, % e datas viram número/data de verdade no Excel)
  function celula(txt) {
    const t = String(txt ?? '').replace(/\s+/g, ' ').trim();
    if (t === '' || t === '–' || t === '-') return { t: 's', v: '' };
    let m = /^([+-]?\d{1,3}(?:\.\d{3})*(?:,\d+)?|[+-]?\d+(?:,\d+)?)\s*(%|p\.p\.)?$/.exec(t);
    if (m) {
      const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
      const dec = (m[1].split(',')[1] || '').length;
      const casas = dec ? '0.' + '0'.repeat(dec) : '0';
      if (m[2] === '%') return { t: 'n', v: n / 100, z: casas + '%' };
      if (m[2] === 'p.p.') return { t: 'n', v: n, z: `+${casas} "p.p.";-${casas} "p.p."` };
      // código com zeros à esquerda (lote, contrato) continua texto
      if (/^0\d/.test(m[1])) return { t: 's', v: t };
      // número sem separador (ex.: 1147) costuma ser código: sem ponto de milhar
      if (!/[.,]/.test(m[1])) return { t: 'n', v: n, z: '0' };
      return { t: 'n', v: n, z: '#,##' + casas };
    }
    m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
    if (m) return { t: 'n', v: (Date.UTC(+m[3], +m[2] - 1, +m[1]) - Date.UTC(1899, 11, 30)) / 86400000, z: 'dd/mm/yyyy' }; // nº de série do Excel (sem fuso)
    return { t: 's', v: t };
  }

  function tabelaParaLinhas(tb) {
    const linhas = [];
    $$('tr', tb).forEach((tr) => {
      const cels = $$('th, td', tr);
      if (!cels.length) return;
      linhas.push(cels.map((c) => {
        const chk = c.querySelector('input[type=checkbox]');
        return chk ? (chk.checked ? 'Sim' : 'Não') : c.innerText;
      }));
    });
    return linhas;
  }

  function nomeAba(base, usados) {
    let n = String(base || 'Tabela').replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Tabela';
    let k = n, i = 2;
    while (usados.has(k.toLowerCase())) k = n.slice(0, 31 - String(i).length - 1) + ' ' + i++;
    usados.add(k.toLowerCase());
    return k;
  }

  function folha(X, linhas, cabecalhos = 1) {
    const ws = {};
    let maxC = 0;
    const larg = [];
    linhas.forEach((lin, r) => {
      maxC = Math.max(maxC, lin.length);
      lin.forEach((v, c) => {
        const cel = r < cabecalhos ? { t: 's', v: String(v ?? '').trim() } : (typeof v === 'number' ? { t: 'n', v } : celula(v));
        if (cel.v === '' && cel.t === 's') return;
        ws[X.utils.encode_cell({ r, c })] = cel;
        larg[c] = Math.max(larg[c] || 6, Math.min(50, String(v ?? '').length + 2));
      });
    });
    ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(linhas.length - 1, 0), c: Math.max(maxC - 1, 0) } });
    ws['!cols'] = larg.map((w) => ({ wch: w || 8 }));
    if (linhas.length > cabecalhos) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: cabecalhos - 1, c: 0 }, e: { r: linhas.length - 1, c: maxC - 1 } }) };
    return ws;
  }

  async function excel(botao) {
    const textoAntes = botao?.innerHTML;
    if (botao) { botao.disabled = true; botao.textContent = 'Gerando…'; }
    try {
      const X = await xlsxLib();
      const wb = X.utils.book_new();
      const usados = new Set();
      // 1) Resumo: título, filtros e indicadores (cards de KPI)
      await Promise.race([carregarEmpresas().promessa, new Promise((r) => setTimeout(r, 3000))]);
      const resumo = [[titulo()]];
      (empresasProntas() || []).forEach((e) => resumo.push(['Empresa', e.razao + (e.cnpj ? ' · CNPJ ' + e.cnpj : '')]));
      resumo.push(['Gerado em', agora()], ['Usuário', $('#usuario')?.textContent.replace('DEMO', '').trim() || '']);
      const f = filtros(true);
      if (f.length) { resumo.push([], ['Filtros']); f.forEach((x) => resumo.push(x)); }
      const kpis = $$('#conteudo .kpi');
      if (kpis.length) {
        resumo.push([], ['Indicador', 'Valor', 'Detalhe']);
        kpis.forEach((k) => resumo.push([$('.t', k)?.innerText || '', $('.v', k)?.innerText || '', $('.d', k)?.innerText || '']));
      }
      X.utils.book_append_sheet(wb, folha(X, resumo, 1), nomeAba('Resumo', usados));

      // 2) Cada tabela da tela vira uma aba (nome = título do card)
      let nTab = 0;
      $$('#conteudo table').forEach((tb) => {
        const linhas = tabelaParaLinhas(tb);
        if (linhas.length < 2) return;
        const card = tb.closest('.card');
        const nome = card?.querySelector('h2')?.textContent || `Tabela ${++nTab}`;
        X.utils.book_append_sheet(wb, folha(X, linhas, tb.tHead ? tb.tHead.rows.length : 1), nomeAba(nome, usados));
      });

      // 3) Dados de cada gráfico (rótulos × séries)
      BI.graficosAtivos().forEach(([id, g]) => {
        const labels = g.data?.labels || [], ds = g.data?.datasets || [];
        if (!labels.length || !ds.length) return;
        const linhas = [['', ...ds.map((d) => d.label || '')], ...labels.map((l, i) => [Array.isArray(l) ? l.join(' ') : String(l), ...ds.map((d) => {
          const v = d.data[i]; const n = v && typeof v === 'object' ? v.y : v;
          return typeof n === 'number' ? n : (n ?? '');
        })])];
        const nome = document.getElementById(id)?.closest('.card')?.querySelector('h2')?.textContent || id;
        X.utils.book_append_sheet(wb, folha(X, linhas, 1), nomeAba('Gráfico ' + nome, usados));
      });

      X.writeFile(wb, nomeArquivo('xlsx'), { compression: true });
    } catch (e) {
      alertaErro(e.message);
    } finally {
      if (botao) { botao.disabled = false; botao.innerHTML = textoAntes; }
    }
  }

  function alertaErro(msg) {
    const d = document.createElement('div');
    d.className = 'aviso'; d.textContent = msg;
    $('#conteudo').prepend(d); setTimeout(() => d.remove(), 6000);
  }

  setTimeout(carregarEmpresas, 1500); // já deixa a empresa padrão pronta
  document.addEventListener('DOMContentLoaded', () => {
    $('#btn-pdf').onclick = pdf;
    $('#btn-excel').onclick = (e) => excel(e.currentTarget);
  });
  if (document.readyState !== 'loading') { $('#btn-pdf').onclick = pdf; $('#btn-excel').onclick = (e) => excel(e.currentTarget); }

  BI.exportar = { pdf, excel };
})();
