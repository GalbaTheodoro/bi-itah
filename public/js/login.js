document.getElementById('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const erro = document.getElementById('erro');
  const btn = document.getElementById('entrar');
  erro.textContent = '';
  btn.disabled = true; btn.textContent = 'Entrando...';
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: document.getElementById('login').value, senha: document.getElementById('senha').value }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || 'Falha no login');
    location.href = '/';
  } catch (e) {
    erro.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});
