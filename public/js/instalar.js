// Botão "Instalar app" (PWA). Chrome/Edge/Android: usa o convite do navegador. iPhone: mostra como adicionar à tela de início.
(() => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  const instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let convite = null;

  function botoes() { return document.querySelectorAll('.btn-instalar'); }
  function mostrar(sim) { botoes().forEach((b) => (b.hidden = !sim)); }

  function ajuda(html) {
    let m = document.getElementById('instalar-ajuda');
    if (!m) {
      m = document.createElement('div');
      m.id = 'instalar-ajuda';
      m.className = 'modal-fundo';
      m.onclick = (e) => { if (e.target === m) m.remove(); };
      document.body.appendChild(m);
    }
    m.innerHTML = `<div class="modal"><img src="/img/icon-192.png" alt="" class="modal-icone"><h2>Instalar o BI Itah</h2>${html}<button class="btn" type="button" onclick="this.closest('.modal-fundo').remove()">Entendi</button></div>`;
  }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); convite = e; mostrar(true); });
  window.addEventListener('appinstalled', () => { convite = null; mostrar(false); });

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('.btn-instalar');
    if (!b) return;
    if (convite) {
      convite.prompt();
      const r = await convite.userChoice.catch(() => null);
      if (r && r.outcome === 'accepted') mostrar(false);
      convite = null;
    } else if (ios) {
      ajuda('<p>No iPhone/iPad, pelo <b>Safari</b>:</p><ol><li>Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li><li>Escolha <b>Adicionar à Tela de Início</b>.</li><li>Toque em <b>Adicionar</b>.</li></ol>');
    } else if (!window.isSecureContext) {
      ajuda('<p>O navegador só instala o app quando o endereço é <b>https://</b> (ou no próprio computador, em <b>localhost</b>).</p><p>Por enquanto, no menu do navegador (⋮) use <b>Adicionar à tela inicial</b> para criar o atalho.</p>');
    } else {
      ajuda('<p>No menu do navegador (⋮), escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</p>');
    }
  });

  document.addEventListener('DOMContentLoaded', () => mostrar(!instalado && (ios || !window.isSecureContext)));
})();
