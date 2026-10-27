import { formatCoins, formatMultiplier } from '../../shared/format';
import { DEFAULT_SPEED, RACE_SPEEDS, type RaceSpeed } from '../../shared/horses';
import type { HostState } from '../../shared/types';
import { horseDef, horseDefs, onHorseDefsChange } from '../horses';
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

/** "de ana" o "del establo" (003 FR-029). */
const ownerText = (number: number) => {
  const owner = horseDef(number).owner;
  return owner === null ? 'del establo' : `de ${owner}`;
};

function horseBadge(number: number): HTMLElement {
  const horse = horseDef(number);
  const s = el('span', 'swatch', String(horse.dorsal));
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

/** Acción destructiva con confirmación en línea "¿Seguro? Sí / No" (sin `confirm()`). */
function confirmButton(label: string, event: string, error: HTMLElement) {
  const wrap = el('span', 'row');
  const trigger = el('button', 'danger', label);
  trigger.type = 'button';
  const ask = el('span', 'row');
  const yes = el('button', 'danger', 'Sí');
  yes.type = 'button';
  const no = el('button', '', 'No');
  no.type = 'button';
  ask.append(el('span', '', '¿Seguro?'), yes, no);
  ask.hidden = true;
  wrap.append(trigger, ask);

  const reset = () => {
    trigger.hidden = false;
    ask.hidden = true;
  };
  trigger.addEventListener('click', () => {
    error.textContent = '';
    trigger.hidden = true;
    ask.hidden = false;
  });
  no.addEventListener('click', reset);
  yes.addEventListener('click', async () => {
    yes.disabled = true;
    const ack = await emitAck(event);
    yes.disabled = false;
    reset();
    if (!ack.ok) error.textContent = ack.error;
  });
  return {
    root: wrap,
    setEnabled(enabled: boolean) {
      trigger.disabled = !enabled;
      if (!enabled) reset();
    },
  };
}

const controls = el('section', 'card stack');
const phaseLabel = el('h2');
const potLine = el('p', 'big');
const controlError = el('p', 'error');
const openButton = actionButton('Abrir ronda', 'host:openRound', controlError);
// Velocidad elegida antes de iniciar; se recuerda entre rondas mientras la página siga abierta.
const SPEED_LABEL: Record<RaceSpeed, string> = { normal: 'Normal', fast: 'Rápida', turbo: 'Turbo' };
const speedSelect = el('select');
speedSelect.setAttribute('aria-label', 'Velocidad de la carrera');
for (const speed of Object.keys(RACE_SPEEDS) as RaceSpeed[]) {
  const option = el('option', '', SPEED_LABEL[speed]);
  option.value = speed;
  speedSelect.append(option);
}
speedSelect.value = DEFAULT_SPEED;
const speedLine = el('p');
const startButton = actionButton('Iniciar carrera', 'host:startRace', controlError, () => ({ speed: speedSelect.value }));
const resetRoundButton = confirmButton('Reiniciar apuestas', 'host:resetRound', controlError);
const resetRaceButton = confirmButton('Reiniciar carrera', 'host:resetRace', controlError);
const buttonRow = el('div', 'row');
buttonRow.append(openButton, speedSelect, startButton, resetRoundButton.root, resetRaceButton.root);

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

controls.append(phaseLabel, potLine, buttonRow, controlError, speedLine, el('h3', '', 'Saldos'), balanceForm, balanceError);

const resultPanel = el('section', 'card stack');

// Panel de apuestas en vivo: nodos creados una vez y actualizados en cada `state`.
const bettingPanel = el('section', 'card stack betting');
const bettingPot = el('p', 'pot');
const bettingCarry = el('p');
const horseCards = el('div', 'horse-cards');
const cards = new Map<number, { total: HTMLElement; bettors: HTMLElement; mult: HTMLElement; list: HTMLElement }>();
const cardHeads = new Map<number, HTMLElement>();
for (const horse of horseDefs()) {
  const card = el('div', 'horse-card');
  const head = el('div', 'row');
  const total = el('p');
  const bettors = el('p');
  const mult = el('p', 'big');
  const list = el('ul', 'bets');
  card.append(head, mult, total, bettors, list);
  cards.set(horse.number, { total, bettors, mult, list });
  cardHeads.set(horse.number, head);
  horseCards.append(card);
}
/** Número, color y nombre vigentes en la cabecera de cada tarjeta. */
function renderCardHeads(): void {
  for (const horse of horseDefs()) {
    cardHeads
      .get(horse.number)!
      .replaceChildren(horseBadge(horse.number), el('strong', '', horse.name), el('span', 'owner', ownerText(horse.number)));
  }
}
renderCardHeads();
onHorseDefsChange(renderCardHeads);
const placedList = el('p');
const missingList = el('p');
const statusRow = el('div', 'status');
const placedBox = el('div');
placedBox.append(el('h3', '', 'Apostaron'), placedList);
const missingBox = el('div');
missingBox.append(el('h3', '', 'Faltan'), missingList);
statusRow.append(placedBox, missingBox);
bettingPanel.append(bettingPot, bettingCarry, horseCards, statusRow);

// Tabla de la carrera en vivo: primero a último.
const racePanel = el('section', 'card stack race-board');
const raceList = el('ol');
racePanel.append(el('h2', '', 'Carrera'), raceList);

// Leaderboard general: siempre visible bajo la escena 3D.
const leaderboardPanel = el('section', 'card leaderboard');
const leaderboardList = el('ol');
leaderboardPanel.append(el('h2', '', 'Leaderboard'), leaderboardList);

/** Monta los paneles laterales en `root` y el leaderboard en `bottom` (una sola vez). */
export function mountPanel(root: HTMLElement, bottom: HTMLElement): void {
  // primero la información de la fase (lo que mira el público), después los controles del host
  root.append(racePanel, bettingPanel, resultPanel, controls);
  bottom.append(leaderboardPanel);
}

export function renderLeaderboard(state: HostState): void {
  if (state.leaderboard.length === 0) {
    const text = state.participants.length > 0 ? 'No hay participantes activos' : 'Aún no hay jugadores';
    leaderboardList.replaceChildren(el('li', 'empty', text));
    return;
  }
  leaderboardList.replaceChildren(
    ...state.leaderboard.map((p, i) => {
      const li = el('li', [p.isFirst ? 'is-first' : '', p.isLast ? 'is-last' : ''].join(' ').trim());
      li.append(
        el('span', 'pos', `${i + 1}.`),
        el('span', 'name', p.username),
        el('span', 'score', `${p.score} pts`),
        el('span', 'coins', formatCoins(p.balance)),
        el('span', p.online ? 'online' : 'offline', p.online ? '●' : '○'),
      );
      li.title = p.online ? 'Conectado' : 'Desconectado';
      return li;
    }),
  );
}

export function renderRaceBoard(state: HostState): void {
  racePanel.hidden = state.phase !== 'racing' || !state.race;
  if (racePanel.hidden || !state.race) return;
  const race = state.race;
  raceList.replaceChildren(
    ...race.order.map((h) => {
      const row = el('li', 'row');
      const bettors = state.horses.find((x) => x.horse === h)?.bets.map((b) => b.username) ?? [];
      row.append(
        horseBadge(h),
        el('strong', '', horseDef(h).name),
        el('span', 'owner', ownerText(h)),
        el('span', '', `casilla ${race.positions[h]}/${state.trackLength}`),
        el('span', 'bettors', bettors.join(', ')),
      );
      return row;
    }),
  );
}

export function renderBetting(state: HostState): void {
  bettingPanel.hidden = state.phase !== 'betting';
  if (bettingPanel.hidden) return;
  bettingPot.textContent = `Pozo: ${formatCoins(state.pot)}`;
  bettingCarry.textContent = state.carry > 0 ? `incluye ${formatCoins(state.carry)} acumulado` : '';
  for (const h of state.horses) {
    const card = cards.get(h.horse)!;
    card.mult.textContent = formatMultiplier(h.multiplier);
    card.total.textContent = `Apostado: ${formatCoins(h.total)}`;
    card.bettors.textContent = `Apostadores: ${h.bettors}`;
    card.list.replaceChildren(
      ...h.bets.map((b) =>
        el('li', '', `${b.username} — ${formatCoins(b.amount)} → ${formatCoins(b.potentialPayout)}`),
      ),
    );
  }
  placedList.textContent = state.betStatus.placed.join(', ') || '—';
  missingList.textContent = state.betStatus.missing.join(', ') || '—';
}

export function renderControls(state: HostState): void {
  lastState = state;
  phaseLabel.textContent = PHASE_LABEL[state.phase];
  openButton.disabled = !(state.phase === 'idle' || state.phase === 'finished');
  startButton.disabled = state.phase !== 'betting';
  speedSelect.disabled = state.phase !== 'betting';
  speedLine.textContent =
    state.race && (state.phase === 'racing' || state.phase === 'finished') ? `Velocidad: ${SPEED_LABEL[state.race.speed]}` : '';
  resetRoundButton.setEnabled(state.phase === 'betting');
  resetRaceButton.setEnabled(state.phase === 'racing');
  potLine.textContent =
    state.phase === 'idle' || state.phase === 'betting'
      ? ''
      : `Pozo: ${formatCoins(state.pot)}` + (state.carry > 0 ? ` (incluye ${formatCoins(state.carry)} acumulado)` : '');
}

export function renderResult(state: HostState): void {
  const result = state.result;
  resultPanel.hidden = state.phase !== 'finished' || !result;
  if (resultPanel.hidden || !result) return;

  const winner = horseDef(result.winner);
  const title = el('h2');
  title.append('Ganó ', horseBadge(result.winner), ` ${winner.name}`);
  const nodes: HTMLElement[] = [title];
  if (result.owner) nodes.push(el('p', 'big owner-share', `Dueño ${result.owner.username} recibe ${formatCoins(result.owner.share)}`));
  if (result.photoFinish) {
    // empatados en la meta, del más cercano a la meta al más lejano (FR-033)
    nodes.push(el('p', 'big', 'PHOTO FINISH'));
    const tied = el('p', 'row');
    tied.append('Empataron: ');
    for (const t of [...result.photoFinish].sort((a, b) => b.value - a.value)) {
      tied.append(horseBadge(t.horse), ` ${horseDef(t.horse).name} `);
    }
    nodes.push(tied);
  }
  if (state.race) {
    const order = el('ol', 'final-order');
    for (const h of state.race.order) {
      const li = el('li', 'row');
      li.append(horseBadge(h), ` ${horseDef(h).name} `, el('span', 'owner', ownerText(h)));
      order.append(li);
    }
    nodes.push(el('h3', '', 'Orden final'), order);
  }
  if (result.winners.length > 0) {
    const list = el('ul');
    for (const w of result.winners) list.append(el('li', '', `${w.username} — ${formatCoins(w.payout)}`));
    nodes.push(list);
  } else {
    nodes.push(el('p', 'big', `Nadie acertó: ${formatCoins(result.carriedOver)} monedas pasan al acumulado`));
  }
  resultPanel.replaceChildren(...nodes);
}
