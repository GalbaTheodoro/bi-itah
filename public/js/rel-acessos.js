// Tela do administrador: libera cada relatório (BI) para cada usuário
(() => {
  const { api, esc } = BI;
  let dados = null, busca = '';

  async function salvar(login, relatorios, aviso) {
    const r = await fetch('/api/acessos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, relatorios }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || 'Erro ao salvar');
    const u = dados.usuarios.find((x) => x.login === login);
    if (u) u.permitidos = j.permitidos;
    aviso.textContent = 'Salvo ✓'; setTimeout(() => (aviso.textContent = ''), 1500);
  }

  function desenhar() {
    const area = document.getElementById('ac-area');
    const b = busca.toLowerCase();
    const lista = dados.usuarios.filter((u) => !b || u.login.toLowerCase().includes(b));
    area.innerHTML = `
      <input class="busca" id="ac-busca" placeholder="Buscar usuário" value="${esc(busca)}">
      <div class="tabela"><table><thead><tr><th class="esq">Usuário</th>${dados.relatorios.map((r) => `<th>${esc(r.titulo)}</th>`).join('')}<th>Todos</th><th></th></tr></thead>
      <tbody>${lista.map((u) => `<tr data-login="${esc(u.login)}">
        <td class="esq">${esc(u.login)}${u.admin ? ' <span class="pill bom">administrador</span>' : ''}${u.ativo ? '' : ' <span class="pill ruim">inativo</span>'}</td>
        ${dados.relatorios.map((r) => `<td><input type="checkbox" data-rel="${r.id}" ${u.permitidos.includes(r.id) ? 'checked' : ''} ${u.admin ? 'disabled' : ''}></td>`).join('')}
        <td><input type="checkbox" data-todos ${u.permitidos.length === dados.relatorios.length ? 'checked' : ''} ${u.admin ? 'disabled' : ''}></td>
        <td class="esq"><span class="aviso-linha" style="font-size:12px;color:var(--pos)"></span></td></tr>`).join('')}</tbody></table></div>
      <div class="legenda-calc">Marque os relatórios que cada usuário pode ver; salva na hora. Administradores (ADMIN_USUARIOS no .env) veem tudo.
      ${dados.alterado ? `Última alteração por ${esc(dados.alterado.por)} em ${new Date(dados.alterado.em).toLocaleString('pt-BR')}.` : ''}</div>`;
    const bx = document.getElementById('ac-busca');
    bx.oninput = () => { busca = bx.value; const pos = bx.selectionStart; desenhar(); const n = document.getElementById('ac-busca'); n.focus(); n.setSelectionRange(pos, pos); };
    area.querySelectorAll('tr[data-login]').forEach((tr) => {
      const login = tr.dataset.login, aviso = tr.querySelector('.aviso-linha');
      const marcados = () => [...tr.querySelectorAll('input[data-rel]')].filter((c) => c.checked).map((c) => c.dataset.rel);
      tr.querySelectorAll('input[data-rel]').forEach((c) => c.onchange = async () => {
        try { await salvar(login, marcados(), aviso); tr.querySelector('[data-todos]').checked = marcados().length === dados.relatorios.length; }
        catch (e) { c.checked = !c.checked; aviso.style.color = 'var(--neg)'; aviso.textContent = e.message; }
      });
      tr.querySelector('[data-todos]').onchange = async (ev) => {
        tr.querySelectorAll('input[data-rel]').forEach((c) => (c.checked = ev.target.checked));
        try { await salvar(login, marcados(), aviso); } catch (e) { aviso.style.color = 'var(--neg)'; aviso.textContent = e.message; }
      };
    });
  }

  async function render(main) {
    main.innerHTML = `<h1>Acessos aos relatórios</h1><p class="sub">Libere cada BI para cada usuário do sistema</p><div class="card" id="ac-area">Carregando...</div>`;
    try { dados = await api('/api/acessos'); desenhar(); }
    catch (e) { document.getElementById('ac-area').innerHTML = `<div class="aviso">${esc(e.message)}</div>`; }
  }

  BI.registrar({ id: 'acessos', titulo: '⚙ Acessos', admin: true, render });
})();
