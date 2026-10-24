import { fetchMe } from './net';
import { applyCssTokens } from './palette';

applyCssTokens();

const home = (role: 'host' | 'player') => (role === 'host' ? '/host' : '/play');

const me = await fetchMe();
if (me) {
  location.replace(home(me.role));
} else {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <form class="form" novalidate>
      <h1>GuanchoTrack</h1>
      <label>Usuario
        <input name="username" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20" required />
      </label>
      <label>Contraseña
        <input name="password" type="password" autocomplete="current-password" required />
      </label>
      <button type="submit">Entrar</button>
      <p class="error" role="alert"></p>
    </form>`;

  const form = app.querySelector('form')!;
  const error = app.querySelector<HTMLElement>('.error')!;
  const button = form.querySelector('button')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    error.textContent = '';
    button.disabled = true;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: String(data.get('username') ?? '').trim(), password: data.get('password') }),
      });
      const body = await res.json();
      if (res.ok) location.replace(home(body.role));
      else error.textContent = body.error ?? 'Error al ingresar';
    } catch {
      error.textContent = 'No se pudo conectar con el servidor';
    } finally {
      button.disabled = false;
    }
  });
}
