import { formatCoins } from '../../shared/format';
import type { HostState, ParticipantRow } from '../../shared/types';
import { emitAck } from '../net';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const button = (label: string, className = '') => {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
};

/** Fila de la tabla: nodos creados una vez y actualizados en cada `state`. */
interface RowView {
  tr: HTMLTableRowElement;
  name: HTMLElement;
  score: HTMLElement;
  coins: HTMLElement;
  online: HTMLElement;
  active: HTMLInputElement;
  actions: HTMLElement;
  remove: HTMLButtonElement;
  editor: HTMLElement;
  error: HTMLElement;
  data: ParticipantRow;
}

const section = el('section', 'card stack admin');
const emptyNote = el('p', 'empty', 'Aún no hay jugadores');
const table = el('table', 'admin-table');
const head = el('tr');
for (const title of ['Jugador', 'Puntaje', 'Monedas', 'Conexión', 'Activo', 'Acciones']) head.append(el('th', '', title));
table.append(el('thead'), el('tbody'));
table.tHead!.append(head);
const tbody = table.tBodies[0];
section.append(el('h2', '', 'Participantes'), emptyNote, table);

const rows = new Map<number, RowView>();

/** Muestra un editor en línea en lugar de los botones de la fila; `Cancelar` lo cierra. */
function openEditor(row: RowView, ...content: HTMLElement[]): void {
  row.error.textContent = '';
  const cancel = button('Cancelar');
  cancel.addEventListener('click', () => closeEditor(row));
  row.editor.replaceChildren(...content, cancel);
  row.editor.hidden = false;
  row.actions.hidden = true;
  row.editor.querySelector<HTMLElement>('input, button')?.focus();
}

function closeEditor(row: RowView): void {
  row.editor.replaceChildren();
  row.editor.hidden = true;
  row.actions.hidden = false;
}

/** Envía la acción; si falla deja el editor abierto con el error, si va bien lo cierra. */
async function submit(row: RowView, trigger: HTMLButtonElement, event: string, payload: unknown): Promise<void> {
  row.error.textContent = '';
  trigger.disabled = true;
  const ack = await emitAck(event, payload);
  trigger.disabled = false;
  if (ack.ok) closeEditor(row);
  else row.error.textContent = ack.error;
}

function textEditor(row: RowView, label: string, type: 'text' | 'password', event: string, payload: (v: string) => unknown) {
  const form = el('form', 'row');
  const input = el('input');
  input.type = type;
  input.autocapitalize = 'off';
  input.setAttribute('aria-label', label);
  input.placeholder = label;
  if (type === 'text') input.value = row.data.username;
  const save = el('button', '', 'Guardar');
  form.append(input, save);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void submit(row, save, event, payload(input.value.trim()));
  });
  openEditor(row, form);
}

function balanceEditor(row: RowView) {
  const form = el('form', 'row');
  const mode = el('select');
  mode.setAttribute('aria-label', 'Modo');
  for (const [value, text] of [
    ['set', 'Fijar'],
    ['add', 'Sumar'],
    ['subtract', 'Restar'],
  ]) {
    const option = el('option', '', text);
    option.value = value;
    mode.append(option);
  }
  const value = el('input');
  value.type = 'number';
  value.inputMode = 'numeric';
  value.min = '0';
  value.step = '1';
  value.placeholder = 'Monedas';
  const apply = el('button', '', 'Aplicar');
  form.append(mode, value, apply);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void submit(row, apply, 'host:adjustBalance', {
      username: row.data.username,
      mode: mode.value,
      value: Number(value.value),
    });
  });
  openEditor(row, form);
}

/** Segundo paso de la eliminación (FR-010): dice adónde van las monedas. */
function removeEditor(row: RowView) {
  const { username, balance } = row.data;
  const text = el(
    'span',
    'warn',
    balance > 0 ? `¿Eliminar a ${username}? Sus ${formatCoins(balance)} monedas pasan al pozo` : `¿Eliminar a ${username}?`,
  );
  const yes = button('Sí, eliminar', 'danger');
  yes.addEventListener('click', () => void submit(row, yes, 'admin:removePlayer', { userId: row.data.id }));
  openEditor(row, text, yes);
}

function createRow(p: ParticipantRow): RowView {
  const tr = el('tr');
  const name = el('td', 'name');
  const score = el('td');
  const coins = el('td');
  const online = el('td');
  const activeCell = el('td');
  const active = el('input');
  active.type = 'checkbox';
  active.setAttribute('aria-label', `Participante activo: ${p.username}`);
  activeCell.append(active);
  const actionsCell = el('td', 'actions');
  const actions = el('div', 'row');
  const rename = button('Renombrar');
  const password = button('Contraseña');
  const balance = button('Saldo');
  const remove = button('Eliminar', 'danger');
  actions.append(rename, password, balance, remove);
  const editor = el('div', 'row');
  editor.hidden = true;
  const error = el('p', 'error');
  actionsCell.append(actions, editor, error);
  tr.append(name, score, coins, online, activeCell, actionsCell);

  const row: RowView = { tr, name, score, coins, online, active, actions, remove, editor, error, data: p };
  active.addEventListener('change', async () => {
    row.error.textContent = '';
    active.disabled = true;
    const ack = await emitAck('admin:setActive', { userId: row.data.id, active: active.checked });
    active.disabled = false;
    if (!ack.ok) {
      active.checked = row.data.active;
      row.error.textContent = ack.error;
    }
  });
  rename.addEventListener('click', () =>
    textEditor(row, 'Nombre nuevo', 'text', 'admin:rename', (username) => ({ userId: row.data.id, username })),
  );
  password.addEventListener('click', () =>
    textEditor(row, 'Contraseña nueva', 'password', 'admin:resetPassword', (pw) => ({ userId: row.data.id, password: pw })),
  );
  balance.addEventListener('click', () => balanceEditor(row));
  remove.addEventListener('click', () => removeEditor(row));
  return row;
}

function updateRow(row: RowView, p: ParticipantRow): void {
  row.data = p;
  row.tr.classList.toggle('inactive', !p.active);
  row.name.textContent = p.username;
  row.score.textContent = `${p.score} pts`;
  row.coins.textContent = formatCoins(p.balance);
  row.online.textContent = p.online ? '● Conectado' : '○ Desconectado';
  row.online.className = p.online ? 'online' : 'offline';
  if (!row.active.disabled) row.active.checked = p.active;
  row.remove.disabled = p.hasActiveBet;
  row.remove.title = p.hasActiveBet ? 'Tiene una apuesta activa' : '';
}

/** Monta la sección de participantes en la pestaña Admin (una sola vez). */
export function mountAdmin(root: HTMLElement): void {
  root.append(section);
}

/** Lista en vivo: actualiza filas en su sitio para no cerrar un editor abierto. */
export function renderParticipants(state: HostState): void {
  const seen = new Set<number>();
  for (const p of state.participants) {
    seen.add(p.id);
    let row = rows.get(p.id);
    if (!row) {
      row = createRow(p);
      rows.set(p.id, row);
    }
    updateRow(row, p);
  }
  for (const [id, row] of rows) {
    if (!seen.has(id)) {
      row.tr.remove();
      rows.delete(id);
    }
  }
  // reordenar solo si cambió el orden (mover un nodo le quita el foco)
  const order = state.participants.map((p) => rows.get(p.id)!.tr);
  if (order.some((tr, i) => tbody.children[i] !== tr)) tbody.append(...order);
  emptyNote.hidden = state.participants.length > 0;
  table.hidden = state.participants.length === 0;
}
