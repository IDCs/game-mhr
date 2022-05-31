import { spawn } from 'child_process';
import _ from 'lodash';
import path from 'path';
import { actions, fs, log, selectors, types, util } from 'vortex-api';

import { setLatestPatch } from './actions';
import { GAME_ID, PACKER_DIR, PACKER_FILES } from './common';

const patchRgx = new RegExp(/re_chunk_000.pak.patch_[0-9]*.pak/, 'gm');

export class PackerMod {
  private mApi: types.IExtensionApi;

  constructor(api: types.IExtensionApi) {
    this.mApi = api;
  }

  public async ensurePacker() {
    const state = this.mApi.getState();
    const discovery = state.settings.gameMode.discovered[GAME_ID];
    if (!discovery?.path) {
      return Promise.reject(new util.ProcessCanceled('Game is not discovered'));
    }
    const stagingPath = selectors.installPathForGame(state, GAME_ID);
    const modName = 'Packer';
    let mod: types.IMod = util.getSafe(state, ['persistent', 'mods', GAME_ID, modName], undefined);
    if (mod === undefined) {
      try {
        await this.createPackerMod(modName);
        mod = util.getSafe(this.mApi.getState(),
          ['persistent', 'mods', GAME_ID, modName], undefined);
        const modInstallPath = path.join(stagingPath, mod.installationPath);
        for (let file of PACKER_FILES) {
          try {
            await fs.copyAsync(path.join(PACKER_DIR, file), path.join(modInstallPath, file));
          } catch (err) {
            if (err?.code !== 'EEXIST') {
              throw err;
            }
          }
        }
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return Promise.resolve(modName);
  }

  public runPacker(): Promise<string> {
    let isClosed: boolean = false;
    return new Promise<string>(async (resolve, reject) => {
      let returned: boolean = false;

      const state = this.mApi.getState();
      const stagingFolder = selectors.installPathForGame(state, GAME_ID);
      const discovery = selectors.discoveryByGame(state, GAME_ID);
      const modName = 'Packer';
      const mod: types.IMod = util.getSafe(state,
          ['persistent', 'mods', GAME_ID, modName], undefined);
      if (mod === undefined || discovery?.path === undefined) {
        return Promise.reject(new util.ProcessCanceled('Game not discovered or packer mod not installed'));
      }
      const patchSuffix = await this.getLatestPatch(this.mApi, discovery);
      const patchFileName = `re_chunk_000.pak.patch_${patchSuffix}.pak`;
      const pakFilePath = path.join(stagingFolder, mod.installationPath, patchFileName);
      await fs.removeAsync(pakFilePath).catch(err => null);
      const packerPath = path.join(stagingFolder, mod.installationPath);
      const exe = path.join(packerPath, PACKER_FILES[0]);
      const args = [`${packerPath}`, `${packerPath}\\${path.basename(pakFilePath)}`];
      const proc = spawn(exe, args);

      proc.stdout.on('data', data => {
        const formatted = data.toString('utf8').split('\n');
        for (let line of formatted) {
          if (line.toLowerCase().indexOf('press enter to exit')) {
            if (!isClosed) {
              proc.stdin.write('\x0D', (err: Error) => null);
            }
          }
        }
      });
      proc.stderr.on('data', data => log('warn', data));

      proc.on('error', (errIn: Error) => {
        isClosed = true;
        if (!returned) {
          returned = true;
          const err = new Error(`${PACKER_FILES[0]} failed: ` + errIn.message);
          err['attachLogOnReport'] = true;
          reject(err);
        }
      });
      proc.on('exit', (code: number) => {
        isClosed = true;
        if (!returned) {
          returned = true;
          if (code === 0) {
            return resolve(pakFilePath);
          } else {
            const err = new Error(`${PACKER_FILES[0]} failed: ${code}`);
            err['attachLogOnReport'] = true;
            return reject(err);
          }
        }
      });
    });
  }

  public createMergedMod(modName: string) {
    const mod: types.IMod = {
      id: modName,
      state: 'installed',
      attributes: {
        name: 'Merged Mod',
        description: 'This mod contains a .pak file that is the merged result of '
                   + 'all mods with loose files.',
        logicalFileName: 'Merged Mod',
        modId: 42, // Meaning of life
        version: '1.0.0',
        installTime: new Date(),
      },
      installationPath: modName,
      type: '',
    };

    return this.createMod(mod, modName);
  }

  public async getNextPatch(api: types.IExtensionApi) {
    const state = api.getState();
    const discovery = selectors.discoveryByGame(state, GAME_ID);
    const latestPatch = await this.getLatestPatch(api, discovery, false);
    const nextPatch = parseInt(latestPatch, 10) + 1;
    const value = nextPatch.toString();
    return value.split('').length < 3
      ? Promise.resolve(value.padStart(3, '0'))
      : Promise.resolve(value);
  }

  private async getLatestPatch(api: types.IExtensionApi,
                               discovery: types.IDiscoveryResult,
                               findMergedPak: boolean = true) {
    const state = api.getState();
    const currentPatch = util.getSafe(state, ['settings', GAME_ID, 'patch'], '000');
    try {
      let foundLink = false;
      const entries = await fs.readdirAsync(discovery.path);
      const filtered = entries.filter(entry => patchRgx.test(entry));
      if (filtered.length > 0) {
        const maxValue = await filtered.reduce(async (prevP, iter) => {
          let prev = await prevP;
          if (foundLink) {
            return prev;
          }
          const value = path.basename(iter, '.pak')
                            .replace('re_chunk_000.pak.patch_', '');
          const stats = await fs.statAsync(path.join(discovery.path, iter));
          if (findMergedPak && stats.isSymbolicLink() || stats.nlink > 1) {
            // This is probably a file we deployed - keep the patch idx.
            prev = value;
            foundLink = true;
            return prev;
          }
          if (parseInt(value, 10) > parseInt(prev, 10)) {
            prev = value;
          }
          return prev;
        }, Promise.resolve('000'));
        if (maxValue !== currentPatch) {
          api.store.dispatch(setLatestPatch(maxValue));
          return Promise.resolve(maxValue);
        }
      }

      return Promise.resolve(currentPatch);
    } catch (err) {
      api.showErrorNotification('Failed to ascertain current patch value', err);
      return Promise.resolve(currentPatch);
    }
  }

  private createMod(mod: types.IMod, modName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.mApi.events.emit('create-mod', GAME_ID, mod, async (error) => {
        if (error !== null) {
          return reject(error);
        }
        const profileId = selectors.lastActiveProfileForGame(this.mApi.getState(), GAME_ID);
        this.mApi.store.dispatch(actions.setModEnabled(profileId, modName, true));
        return resolve();
      });
    });
  }

  private createPackerMod(modName: string): Promise<void> {
    const mod: types.IMod = {
      id: modName,
      state: 'installed',
      attributes: {
        name: 'Packer',
        description: 'This "mod" is in fact a tool Vortex uses to merge loose files - '
                   + 'please keep it enabled and deployed.',
        logicalFileName: 'Packer',
        modId: 42, // Meaning of life
        version: '1.0.0',
        installTime: new Date(),
      },
      installationPath: modName,
      type: 'mhr-packer',
    };

    return this.createMod(mod, modName);
  }
}
