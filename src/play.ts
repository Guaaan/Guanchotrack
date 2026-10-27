import { formatCoins, formatMultiplier } from '../shared/format';
import type { HorseNumber, PlayerState } from '../shared/types';
import { horseDef, horseDefs, onHorseDefsChange, setHorseDefs } from './horses';
import { connect, emitAck } from './net';
import { guard } from './session';
import { mountStable, swatch } from './stable';

const { main, nameEl } = await guard('player');

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const balanceLine = el('p', 'balance');
const section = el('section', 'phase');
main.append(balanceLine, section);
// sección "Caballos" (feature 003): visible en todas las fases, debajo de la vista de la fase
const stable = mountStable(main, emitAck);

/** Vista construida para la fase actual; `update` solo toca nodos de texto. */
let view: { key: string; update(state: PlayerState): void; refresh?(): void } | null = null;
// caballos personalizados: reconstruir la vista con los nombres y colores vigentes; en apuestas
// los caballos pueden cambiar de dueño o de nombre, y la vista se refresca sin perder la selección
onHorseDefsChange(() => {
  if (view?.key.startsWith('betting')) view.refresh?.();
  else view = null;
});

function buildBetting(): typeof view {
  let selected: HorseNumber | null = null;
  const root = el('div', 'stack');
  const grid = el('div', 'horses');
  const buttons = new Map<HorseNumber, { button: HTMLButtonElement; label: HTMLElement; mult: HTMLElement }>();
  for (const horse of horseDefs()) {
    const button = el('button', 'horse');
    button.type = 'button';
    const label = el('span', 'name');
    const mult = el('span', 'mult');
    button.append(swatch(horse), label, mult);
    button.addEventListener('click', () => {
      selected = horse.number;
      refreshSelection();
    });
    buttons.set(horse.number, { button, label, mult });
    grid.append(button);
  }
  /** Muestra y nombre vigentes de cada caballo (pueden cambiar durante las apuestas). */
  const refreshHorses = () => {
    for (const horse of horseDefs()) {
      const { button, label } = buttons.get(horse.number)!;
      button.firstElementChild!.replaceWith(swatch(horse));
      label.textContent = horse.name;
    }
  };
  refreshHorses();

  const amount = el('input');
  amount.type = 'number';
  amount.inputMode = 'numeric';
  amount.min = '1';
  amount.step = '1';
  amount.placeholder = 'Monto';
  const label = el('label', '', 'Monto');
  label.append(amount);
  const submit = el('button', '', 'Apostar');
  submit.type = 'button';
  const error = el('p', 'error');
  error.setAttribute('role', 'alert');
  const myBet = el('div', 'card');
  const myBetText = el('p');
  const potential = el('p', 'big');
  myBet.append(myBetText, potential);

  root.append(el('h2', '', 'Elige tu caballo'), grid, label, submit, error, myBet);
  section.replaceChildren(root);

  const refreshSelection = () => {
    for (const [n, { button }] of buttons) button.classList.toggle('selected', n === selected);
  };

  submit.addEventListener('click', async () => {
    error.textContent = '';
    if (selected === null) {
      error.textContent = 'Elige un caballo';
      return;
    }
    const value = Number(amount.value);
    submit.disabled = true;
    const ack = await emitAck('bet:place', { horse: selected, amount: value });
    submit.disabled = false;
    if (!ack.ok) error.textContent = ack.error;
  });

  return {
    key: 'betting',
    refresh: refreshHorses,
    update(state) {
      for (const o of state.odds) buttons.get(o.horse)!.mult.textContent = formatMultiplier(o.multiplier);
      const current = state.myBet?.amount ?? 0;
      amount.max = String(state.balance + current);
      if (selected === null && state.myBet) {
        selected = state.myBet.horse;
        refreshSelection();
        if (document.activeElement !== amount && !amount.value) amount.value = String(state.myBet.amount);
      }
      submit.textContent = state.myBet ? 'Cambiar apuesta' : 'Apostar';
      myBet.hidden = !state.myBet;
      if (state.myBet) {
        const horse = horseDef(state.myBet.horse);
        myBetText.textContent = `Tu apuesta: ${formatCoins(state.myBet.amount)} al ${horse.dorsal} ${horse.name}`;
        potential.textContent = `Recibirías si gana: ${formatCoins(state.myBet.potentialPayout)}`;
      }
    },
  };
}

function buildMessage(key: string, title: string): typeof view {
  const heading = el('h2', '', title);
  const detail = el('p', 'big');
  const rankLine = el('p', 'rank');
  // bloque de carrera: lugar del caballo apostado y los 3 primeros (FR-028b)
  const raceBlock = el('div', 'race-info');
  const myHorseLine = el('p', 'my-horse');
  const topTitle = el('h3');
  const topList = el('ol', 'top3');
  raceBlock.append(myHorseLine, topTitle, topList);
  section.replaceChildren(heading, detail, raceBlock, rankLine);
  return {
    key,
    update(state) {
      if (state.phase === 'racing') {
        const bet = state.myBet;
        detail.textContent = bet
          ? `Apostaste ${formatCoins(bet.amount)} al ${horseDef(bet.horse).dorsal} ${horseDef(bet.horse).name}`
          : 'No apostaste en esta ronda';
      } else if (state.phase === 'finished' && state.myResult) {
        const r = state.myResult;
        const winner = horseDef(r.winner);
        heading.textContent = !r.participated
          ? 'No participaste en esta ronda'
          : r.won
            ? `¡Ganaste ${formatCoins(r.payout)} monedas!`
            : 'Perdiste';
        detail.textContent = `Ganó el ${winner.dorsal} ${winner.name}. Saldo: ${formatCoins(state.balance)}`;
      } else {
        detail.textContent = '';
      }
      const order = state.raceOrder;
      raceBlock.hidden = !order;
      if (order) {
        const finished = state.phase === 'finished';
        const mine = finished ? state.myResult?.horse ?? null : state.myBet?.horse ?? null;
        myHorseLine.hidden = mine === null;
        if (mine !== null) {
          const place = order.indexOf(mine) + 1;
          myHorseLine.replaceChildren('Tu caballo: ', swatch(horseDef(mine)), ` ${horseDef(mine).name} · ${finished ? 'terminó' : 'va'} ${place}.º`);
        }
        topTitle.textContent = finished ? 'Podio' : 'Adelante';
        topList.replaceChildren(
          ...order.slice(0, 3).map((n, i) => {
            const li = el('li');
            li.append(`${i + 1}.º `, swatch(horseDef(n)), ` ${horseDef(n).name}`);
            if (n === mine) li.classList.add('mine');
            return li;
          }),
        );
      }
      // posición propia en el leaderboard general (solo carrera y resultado)
      const rank = state.myRank;
      rankLine.hidden = !rank;
      if (rank) {
        rankLine.textContent = `Ranking: ${rank.position}.º de ${rank.total} · ${rank.score} ${rank.score === 1 ? 'punto' : 'puntos'}`;
      }
    },
  };
}

function render(state: PlayerState): void {
  balanceLine.textContent = `Saldo: ${formatCoins(state.balance)}`;
  const key = `${state.phase}:${state.roundId}`;
  if (view?.key !== key) {
    view =
      state.phase === 'betting'
        ? buildBetting()
        : state.phase === 'racing'
          ? buildMessage(key, 'Carrera en curso, mira la pantalla')
          : state.phase === 'finished'
            ? buildMessage(key, 'Resultado')
            : buildMessage(key, 'Esperando que el host abra una ronda');
    view!.key = key;
  }
  view!.update(state);
  stable.update(state);
}

connect((state) => {
  const s = state as PlayerState;
  // el host puede renombrar al jugador sin cerrar su sesión (FR-008)
  nameEl.textContent = s.username;
  setHorseDefs(s.horseDefs);
  render(s);
});
