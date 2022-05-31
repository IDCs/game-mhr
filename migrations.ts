import semver from 'semver';
import { actions, selectors, types, util } from 'vortex-api';
import { GAME_ID } from './common';

export async function migrate102(context, oldVersion): Promise<void> {
  if (semver.gte(oldVersion, '1.0.2')) {
    return Promise.resolve();
  }

  const state = context.api.getState();
  const discovery: types.IDiscoveryResult = selectors.discoveryByGame(state, GAME_ID);

  const activatorId = selectors.activatorForGame(state, GAME_ID);
  const activator = util.getActivator(activatorId);
  if (!discovery?.path || !activator) {
    return Promise.resolve();
  }

  const mods: { [modId: string]: types.IMod } = util.getSafe(state,
    ['persistent', 'mods', GAME_ID], {});
  const luaMods = Object.values(mods).filter(mod => mod.type === 'mhr-lua-mod');

  if (luaMods.length === 0) {
    // No mods - no problem.
    return Promise.resolve();
  }

  const modsPath = path.join(discovery.path, 'autorun');
  return context.api.awaitUI()
    .then(() => fs.ensureDirWritableAsync(modsPath))
    .then(() => context.api.emitAndAwait('purge-mods-in-path', GAME_ID, 'mhr-lua-mod', modsPath))
    .then(() => context.api.store.dispatch(actions.setDeploymentNecessary(GAME_ID, true)));
}
