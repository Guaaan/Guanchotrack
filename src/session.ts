import { fetchMe, logout } from './net';
import { applyCssTokens } from './palette';

/**
 * Comprueba la sesión de una vista protegida: sin sesión vuelve al login y con otro rol
 * va a su vista. Pinta la cabecera con el usuario y "Salir". La autorización real está en el servidor.
 */
export async function guard(
  role: 'host' | 'player',
): Promise<{ username: string; main: HTMLElement; nameEl: HTMLElement }> {
  applyCssTokens();
  const me = await fetchMe();
  if (!me) {
    location.replace('/');
    return new Promise(() => {});
  }
  if (me.role !== role) {
    location.replace(me.role === 'host' ? '/host' : '/play');
    return new Promise(() => {});
  }

  const app = document.getElementById('app')!;
  const header = document.createElement('header');
  header.className = 'header';
  const name = document.createElement('span');
  name.textContent = me.username;
  const out = document.createElement('button');
  out.type = 'button';
  out.textContent = 'Salir';
  out.addEventListener('click', async () => {
    await logout();
    location.replace('/');
  });
  header.append(name, out);
  const main = document.createElement('main');
  app.replaceChildren(header, main);
  return { username: me.username, main, nameEl: name };
}
