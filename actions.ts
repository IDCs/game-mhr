import { createAction } from 'redux-act';

export const setLatestPatch = createAction('MHR_SET_LATEST_PATCH', (patch: string) => patch);