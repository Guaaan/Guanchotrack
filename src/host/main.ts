import type { HostState } from '../../shared/types';
import { connect } from '../net';
import { guard } from '../session';
import { mountPanel, renderBetting, renderControls, renderResult } from './panel';

const { main } = await guard('host');
mountPanel(main);

connect((state) => {
  const s = state as HostState;
  renderControls(s);
  renderBetting(s);
  renderResult(s);
});
