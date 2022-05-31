import { types } from 'vortex-api';
export interface IDeployment {
  [modType: string]: types.IDeployedFile[];
}