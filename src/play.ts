import { formatCoins, formatMultiplier } from '../shared/format';
import { DEFAULT_HORSES } from '../shared/horses';
import type { HorseNumber, PlayerState } from '../shared/types';
import { connect, emitAck } from './net';
import { guard } from './session';

const { main, nameEl } = await guard('player');

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const swatch = (horse: (typeof DEFAULT_HORSES)[number]) => {
  const s = el('span', 'swatch', String(horse.number));
  s.style.background = `var(--c-${horse.color})`;
  s.style.color = `var(--c-${horse.numberColor})`;
  return s;
};

const balanceLine = el('p', 'balance');
const section = el('section', 'phase');
main.append(balanceLine, section);

/** Vista construida para la fase actual; `update` solo toca nodos de texto. */
let view: { key: string; update(state: PlayerState): void } | null = null;

function buildBetting(): typeof view {
  let selected: HorseNumber | null = null;
  const root = el('div', 'stack');
  const grid = el('div', 'horses');
  const buttons = new Map<HorseNumber, { button: HTMLButtonElement; mult: HTMLElement }>();
  for (const horse of DEFAULT_HORSES) {
    const button = el('button', 'horse');
    button.type = 'button';
    const mult = el('span', 'mult');
    button.append(swatch(horse), el('span', 'name', horse.name), mult);
    button.addEventListener('click', () => {
      selected = horse.number;
      refreshSelection();
    });
    buttons.set(horse.number, { button, mult });
    grid.append(button);
  }

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
        const horse = DEFAULT_HORSES[state.myBet.horse - 1];
        myBetText.textContent = `Tu apuesta: ${formatCoins(state.myBet.amount)} al ${horse.number} ${horse.name}`;
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
          ? `Apostaste ${formatCoins(bet.amount)} al ${bet.horse} ${DEFAULT_HORSES[bet.horse - 1].name}`
          : 'No apostaste en esta ronda';
      } else if (state.phase === 'finished' && state.myResult) {
        const r = state.myResult;
        const winner = DEFAULT_HORSES[r.winner - 1];
        heading.textContent = !r.participated
          ? 'No participaste en esta ronda'
          : r.won
            ? `¡Ganaste ${formatCoins(r.payout)} monedas!`
            : 'Perdiste';
        detail.textContent = `Ganó el ${winner.number} ${winner.name}. Saldo: ${formatCoins(state.balance)}`;
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
          myHorseLine.replaceChildren('Tu caballo: ', swatch(DEFAULT_HORSES[mine - 1]), ` ${DEFAULT_HORSES[mine - 1].name} · ${finished ? 'terminó' : 'va'} ${place}.º`);
        }
        topTitle.textContent = finished ? 'Podio' : 'Adelante';
        topList.replaceChildren(
          ...order.slice(0, 3).map((n, i) => {
            const li = el('li');
            li.append(`${i + 1}.º `, swatch(DEFAULT_HORSES[n - 1]), ` ${DEFAULT_HORSES[n - 1].name}`);
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
}

connect((state) => {
  const s = state as PlayerState;
  // el host puede renombrar al jugador sin cerrar su sesión (FR-008)
  nameEl.textContent = s.username;
  render(s);
});
