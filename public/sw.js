// Service worker do BI Itah: permite instalar como app e abre a tela mais rápido.
// Os DADOS (/api) nunca ficam em cache: sempre vêm do servidor.
const VERSAO = 'bi-itah-v1';
const ARQUIVOS = ['/css/app.css', '/img/logo.png', '/img/icon-192.png', '/vendor/chart.js', '/js/login.js', '/login.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // rede primeiro (sempre a versão nova); sem rede, usa o que tiver guardado
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok && r.type === 'basic' && !r.redirected) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || new Response('Sem conexão com o servidor do BI.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })))
  );
});
