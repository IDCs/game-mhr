import { setLatestPatch } from './actions';
import { types, util } from 'vortex-api';

export const reducer: types.IReducerSpec = {
  reducers: {
    [setLatestPatch as any]: (state, payload) => util.setSafe(state, ['patch'], payload),
  },
  defaults: {
    patch: '000',
  },
};
