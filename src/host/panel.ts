import { formatCoins } from '../../shared/format';
import { HORSES } from '../../shared/horses';
import type { HostState } from '../../shared/types';
import { emitAck } from '../net';

const PHASE_LABEL: Record<HostState['phase'], string> = {
  idle: 'Sin ronda',
  betting: 'Apuestas abiertas',
  racing: 'Carrera en curso',
  finished: 'Ronda terminada',
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function horseBadge(number: number): HTMLElement {
  const horse = HORSES[number - 1];
  const s = el('span', 'swatch', String(horse.number));
  s.style.background = `var(--c-${horse.color})`;
  s.style.color = `var(--c-${horse.numberColor})`;
  return s;
}

/** Botón que llama a un evento con ack y muestra el error en `error`. */
function actionButton(label: string, event: string, error: HTMLElement, payload: () => unknown = () => ({})) {
  const button = el('button', '', label);
  button.type = 'button';
  button.addEventListener('click', async () => {
    error.textContent = '';
    button.disabled = true;
    const ack = await emitAck(event, payload());
    button.disabled = false;
    if (!ack.ok) error.textContent = ack.error;
    else if (lastState) renderControls(lastState);
  });
  return button;
}

let lastState: HostState | null = null;

const controls = el('section', 'card stack');
const phaseLabel = el('h2');
const potLine = el('p', 'big');
const raceLine = el('p');
const controlError = el('p', 'error');
const openButton = actionButton('Abrir ronda', 'host:openRound', controlError);
const startButton = actionButton('Iniciar carrera', 'host:startRace', controlError);
const buttonRow = el('div', 'row');
buttonRow.append(openButton, startButton);

const balanceForm = el('form', 'row');
const userInput = el('input');
userInput.placeholder = 'Usuario';
userInput.autocapitalize = 'off';
const modeSelect = el('select');
for (const [value, text] of [
  ['set', 'Fijar'],
  ['add', 'Sumar'],
  ['subtract', 'Restar'],
]) {
  const option = el('option', '', text);
  option.value = value;
  modeSelect.append(option);
}
const valueInput = el('input');
valueInput.type = 'number';
valueInput.inputMode = 'numeric';
valueInput.min = '0';
valueInput.step = '1';
valueInput.placeholder = 'Monedas';
const applyButton = el('button', '', 'Aplicar');
const balanceError = el('p', 'error');
balanceForm.append(userInput, modeSelect, valueInput, applyButton);
balanceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  balanceError.textContent = '';
  applyButton.disabled = true;
  const ack = await emitAck('host:adjustBalance', {
    username: userInput.value.trim(),
    mode: modeSelect.value,
    value: Number(valueInput.value),
  });
  applyButton.disabled = false;
  if (ack.ok) {
    balanceError.textContent = `Saldo de ${userInput.value.trim()} actualizado`;
    valueInput.value = '';
  } else {
    balanceError.textContent = ack.error;
  }
});

controls.append(phaseLabel, potLine, buttonRow, controlError, raceLine, el('h3', '', 'Saldos'), balanceForm, balanceError);

const resultPanel = el('section', 'card stack');

/** Monta los paneles en `root` (una sola vez). */
export function mountPanel(root: HTMLElement): void {
  root.append(controls, resultPanel);
}

export function renderControls(state: HostState): void {
  lastState = state;
  phaseLabel.textContent = PHASE_LABEL[state.phase];
  openButton.disabled = !(state.phase === 'idle' || state.phase === 'finished');
  startButton.disabled = state.phase !== 'betting';
  potLine.textContent =
    state.phase === 'idle'
      ? ''
      : `Pozo: ${formatCoins(state.pot)}` + (state.carry > 0 ? ` (incluye ${formatCoins(state.carry)} acumulado)` : '');
  raceLine.textContent =
    state.phase === 'racing' && state.race
      ? `Tick ${state.race.tick} · ` + state.race.order.map((h) => `${h}:${state.race!.positions[h]}`).join('  ')
      : '';
}

export function renderResult(state: HostState): void {
  const result = state.result;
  resultPanel.hidden = state.phase !== 'finished' || !result;
  if (resultPanel.hidden || !result) return;

  const winner = HORSES[result.winner - 1];
  const title = el('h2');
  title.append('Ganó ', horseBadge(result.winner), ` ${winner.name}`);
  const nodes: HTMLElement[] = [title];
  if (result.photoFinish) nodes.push(el('p', 'big', 'PHOTO FINISH'));
  if (result.winners.length > 0) {
    const list = el('ul');
    for (const w of result.winners) list.append(el('li', '', `${w.username} — ${formatCoins(w.payout)}`));
    nodes.push(list);
  } else {
    nodes.push(el('p', 'big', `Nadie acertó: ${formatCoins(result.carriedOver)} monedas pasan al acumulado`));
  }
  resultPanel.replaceChildren(...nodes);
}
