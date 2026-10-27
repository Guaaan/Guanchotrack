import { formatCoins } from '../shared/format';
import { HORSE_PRICE_PLAYER, HORSE_PRICE_STABLE, validateHorseIdentity, type CoatName } from '../shared/horses';
import type { Ack, HorseDef, HorseNumber, PlayerState } from '../shared/types';
import { horseDefs, onHorseDefsChange } from './horses';

const COAT_LABELS: Record<CoatName, string> = {
  castano: 'castaño',
  pinto: 'pinto',
  tordo: 'tordo',
  palomino: 'palomino',
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

/** Muestra de manta con el número visible (dorsal). */
export const swatch = (horse: HorseDef) => {
  const s = el('span', 'swatch', String(horse.dorsal));
  s.style.background = `var(--c-${horse.color})`;
  s.style.color = `var(--c-${horse.numberColor})`;
  return s;
};

interface Row {
  root: HTMLElement;
  owner: HTMLElement;
  price: HTMLElement;
  buy: HTMLButtonElement;
  error: HTMLElement;
  /** Solo en caballos propios: lo generado y el editor de nombre y número. */
  mine: HTMLElement;
  earned: HTMLElement;
  editToggle: HTMLButtonElement;
  form: HTMLFormElement;
  name: HTMLInputElement;
  dorsal: HTMLInputElement;
  save: HTMLButtonElement;
}

/**
 * Sección "Caballos" del celular (feature 003, research R12): los 6 caballos con su dueño y
 * precio, y el botón "Comprar". Se reconstruye cuando cambian los caballos y `update()` solo toca
 * textos y botones, así no se pierde lo que el jugador esté escribiendo.
 */
export function mountStable(parent: HTMLElement, emitAck: (event: string, payload: unknown) => Promise<Ack>) {
  const section = el('section', 'stable');
  const list = el('div', 'stable-list');
  section.append(el('h2', '', 'Caballos'), list);
  parent.append(section);

  let rows = new Map<HorseNumber, Row>();
  let last: PlayerState | null = null;

  const ownerLabel = (horse: HorseDef, me: string) =>
    horse.owner === null ? 'Establo' : horse.owner === me ? 'Tú' : `De ${horse.owner}`;

  function build(): void {
    rows = new Map();
    list.replaceChildren(
      ...horseDefs().map((horse) => {
        const root = el('div', 'stable-horse');
        const info = el('div', 'stable-info');
        const meta = el('span', 'meta', COAT_LABELS[horse.coat]);
        const owner = el('span', 'owner');
        info.append(el('strong', 'name', horse.name), meta, owner);
        const price = el('span', 'price');
        const buy = el('button', '', 'Comprar');
        buy.type = 'button';
        const error = el('p', 'error');
        error.setAttribute('role', 'alert');
        // caballo propio: lo generado y "Editar" con nombre y número en línea
        const mine = el('div', 'stable-mine');
        const earned = el('span', 'earned');
        const editToggle = el('button', 'secondary', 'Editar');
        editToggle.type = 'button';
        const form = el('form', 'stable-edit');
        form.hidden = true;
        const name = el('input');
        name.maxLength = 16;
        name.setAttribute('aria-label', 'Nombre');
        const dorsal = el('input');
        dorsal.type = 'number';
        dorsal.inputMode = 'numeric';
        dorsal.min = '1';
        dorsal.max = '99';
        dorsal.step = '1';
        dorsal.setAttribute('aria-label', 'Número');
        const save = el('button', '', 'Guardar');
        form.append(name, dorsal, save);
        mine.append(earned, editToggle, form);
        root.append(swatch(horse), info, price, buy, mine, error);

        buy.addEventListener('click', async () => {
          error.textContent = '';
          buy.disabled = true;
          const ack = await emitAck('horse:buy', { horse: horse.number, expectedOwner: horse.owner });
          if (!ack.ok) error.textContent = ack.error;
          if (last) update(last);
        });
        editToggle.addEventListener('click', () => {
          form.hidden = !form.hidden;
          error.textContent = '';
          name.value = horse.name;
          dorsal.value = String(horse.dorsal);
          if (!form.hidden) name.focus();
        });
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          error.textContent = '';
          // validación previa con las mismas reglas que el servidor
          const check = validateHorseIdentity(horseDefs(), horse.number, name.value, Number(dorsal.value));
          if (!check.ok) {
            error.textContent = check.error;
            return;
          }
          save.disabled = true;
          const ack = await emitAck('horse:edit', { horse: horse.number, name: check.name, dorsal: check.dorsal });
          save.disabled = false;
          if (ack.ok) form.hidden = true;
          else error.textContent = ack.error;
        });
        rows.set(horse.number, { root, owner, price, buy, error, mine, earned, editToggle, form, name, dorsal, save });
        return root;
      }),
    );
  }

  function update(state: PlayerState): void {
    last = state;
    for (const horse of horseDefs()) {
      const row = rows.get(horse.number)!;
      const mine = horse.owner === state.username;
      row.owner.textContent = ownerLabel(horse, state.username);
      row.root.classList.toggle('mine', mine);
      // precio según el dueño visible; el servidor lo vuelve a comprobar al comprar
      const price = mine ? null : horse.owner === null ? HORSE_PRICE_STABLE : HORSE_PRICE_PLAYER;
      row.price.textContent = price === null ? '' : `${formatCoins(price)} monedas`;
      row.buy.hidden = price === null;
      const reason =
        state.phase === 'racing' ? 'Carrera en curso' : price !== null && state.balance < price ? 'Saldo insuficiente' : '';
      row.buy.disabled = reason !== '';
      row.buy.title = reason;
      row.buy.textContent = reason || 'Comprar';

      row.mine.hidden = !mine;
      const earned = state.myHorses.find((h) => h.horse === horse.number)?.earned ?? 0;
      row.earned.textContent = `Te ha generado ${formatCoins(earned)}`;
      const racing = state.phase === 'racing';
      row.editToggle.disabled = racing;
      row.save.disabled = racing;
      if (racing || !mine) row.form.hidden = true;
    }
  }

  build();
  onHorseDefsChange(() => {
    build();
    if (last) update(last);
  });
  return { update };
}
