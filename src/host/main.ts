import type { HostState } from '../../shared/types';
import { setHorseDefs } from '../horses';
import { connect } from '../net';
import { guard } from '../session';
import { mountAdmin, renderHorses, renderParticipants, renderPurchases } from './admin';
import { mountPanel, renderBetting, renderControls, renderLeaderboard, renderRaceBoard, renderResult } from './panel';
import { createScene } from './scene';

document.body.classList.add('host');
const { main } = await guard('host');
// Pestañas "Juego" / "Admin": solo alternan `hidden`; socket y escena siguen vivos (research R10).
const game = document.createElement('div');
game.className = 'host-layout';
const adminView = document.createElement('div');
adminView.className = 'admin-view';
adminView.hidden = true;
main.append(game, adminView);
const tabs = document.createElement('nav');
tabs.className = 'tabs';
tabs.setAttribute('role', 'tablist');
const tabButtons = (['Juego', 'Admin'] as const).map((label) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tab';
  button.textContent = label;
  button.setAttribute('role', 'tab');
  button.addEventListener('click', () => showTab(label));
  return button;
});
tabs.append(...tabButtons);
main.previousElementSibling?.firstElementChild?.after(tabs);

function showTab(label: 'Juego' | 'Admin'): void {
  game.hidden = label !== 'Juego';
  adminView.hidden = label !== 'Admin';
  for (const b of tabButtons) b.setAttribute('aria-selected', String(b.textContent === label));
}
showTab('Juego');

const left = document.createElement('div');
left.className = 'main-column';
const stage = document.createElement('div');
stage.className = 'stage';
const bottom = document.createElement('div');
left.append(stage, bottom);
const side = document.createElement('div');
side.className = 'side';
game.append(left, side);
mountPanel(side, bottom);
mountAdmin(adminView);

const scene = createScene(stage);

let prevPhase: HostState['phase'] | null = null;
let latest: HostState | null = null;
/** El panel de resultado espera a que termine el photo finish. */
let resultReady = false;

connect((state) => {
  const s = state as HostState;
  latest = s;
  setHorseDefs(s.horseDefs);
  scene.setHorses(s.horseDefs);
  scene.setRace(s.phase === 'racing' || s.phase === 'finished' ? s.race : null, s.phase);
  renderControls(s);
  renderBetting(s);
  renderRaceBoard(s);
  renderLeaderboard(s);
  renderParticipants(s);
  renderHorses(s);
  renderPurchases(s);

  if (s.phase === 'finished' && prevPhase !== 'finished') {
    resultReady = false;
    // al recargar ya en 'finished' no se repite la animación
    if (prevPhase !== null) scene.finish(s.result?.photoFinish ?? null);
    scene.whenIdle().then(() => {
      resultReady = true;
      if (latest?.phase === 'finished') renderResult(latest);
    });
  }
  if (s.phase !== 'finished' || resultReady) renderResult(s);
  prevPhase = s.phase;
});
