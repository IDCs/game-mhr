import Bluebird from 'bluebird';
import path from 'path';

import { GAME_ID, GAME_PAK_FILE } from './common';
import { PackerMod } from './packer';
import { reducer } from './reducers';
import { IDeployment } from './types';

import { fs, selectors, types, util } from 'vortex-api';
import { walkDirPath } from './util';

import { migrate102 } from './migrations';

const NATIVES_DIR = 'natives' + path.sep;

const LUA_EXT = '.lua';
const PAK_EXT = '.pak';

const STEAM_ID = '1446780';

function findGame() {
  return util.steam.findByAppId(STEAM_ID)
    .then(game => game.gamePath);
}

function queryREFramework(api: types.IExtensionApi) {
  const state = api.getState();
  const dinput = Object.values(state.persistent.mods[GAME_ID])
    .find(mod => mod.type === 'dinput');

  if (dinput !== undefined) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) =>
    api.showDialog('info', 'Soft requirement: REFramework', {
      text: 'Many mods for Monster Hunter Rise (mods that include lua scripts) '
          + 'require the mod REFramework to be installed in order to function correctly. '
          + 'You can download it from the Nexus Mods website by clicking the Vortex button '
          + 'in the top right corner. Once installed, please ensure it is enabled and deployed at all times.',
    }, [
      { label: 'Continue' },
      {
        label: 'Go to Mod Page',
        action: () => util.opn('https://www.nexusmods.com/monsterhunterrise/mods/26')
          .catch(err => null) },
    ]).then(() => resolve()));
}

function prepareForModding(api: types.IExtensionApi,
                           discovery: types.IDiscoveryResult,
                           packer: PackerMod) {
  return packer.ensurePacker()
    .then(() => fs.ensureDirWritableAsync(path.join(discovery.path, 'natives')))
    .then(() => fs.ensureDirWritableAsync(path.join(discovery.path, 'reframework', 'autorun')))
    .then(() => queryREFramework(api));
}

function testSupportedPAK(files, gameId) {
  const supported = (gameId === GAME_ID)
    && (files.find(file => path.extname(file) === PAK_EXT) !== undefined);
  return Promise.resolve({
    supported,
    requiredFiles: [],
  });
}

function installPAK(api: types.IExtensionApi, files: string[], packer: PackerMod) {
  const paks = files.filter(file => path.extname(file) === PAK_EXT);
  return Bluebird.map(paks, file => packer.getNextPatch(api)
    .then((patch) => {
      const destination = path.basename(file).match(/re_chunk_000.pak.patch_[0-9]*.pak/gm) !== null
        ? path.basename(file)
        : `re_chunk_000.pak.patch_${patch}.pak`;
      return Bluebird.resolve(({
        type: 'copy',
        source: file,
        destination,
      }));
    }))
  .then(instructions => Promise.resolve({ instructions }));
}

function testSupportedLUA(files, gameId) {
  const supported = (gameId === GAME_ID)
    && (files.find(file => path.extname(file) === LUA_EXT) !== undefined);
  return Promise.resolve({
    supported,
    requiredFiles: [],
  });
}

function installLUA(files) {
  const modTypeInstruction = {
    type: 'setmodtype',
    value: 'mhr-lua-mod',
  };
  const luaInstructions = files.filter(file => path.extname(file) === LUA_EXT)
    .map(file => {
      const segments = file.split(path.sep);
      const idx = segments.findIndex(seg => seg.toLowerCase() === 'autorun');
      const destination = (idx !== -1)
        ? segments.slice(idx).join(path.sep)
        : path.join('autorun', path.basename(file));
      return {
      type: 'copy',
      source: file,
      destination,
    };
  });
  const otherFiles = files.filter(file => path.extname(file) !== LUA_EXT
                                       && path.extname(file) !== '')
    .map(file => ({
      type: 'copy',
      source: file,
      destination: file,
    }));
  const instructions = [].concat(modTypeInstruction, luaInstructions, otherFiles);
  return Promise.resolve({ instructions });
}

function testSupportedLoose(files, gameId) {
  // Make sure we're able to support this mod.
  const supported = (gameId === GAME_ID)
    && (files.find(file => file.indexOf(NATIVES_DIR) !== -1) !== undefined);
  return Promise.resolve({
    supported,
    requiredFiles: [],
  });
}

async function installLoose(files,
                            destinationPath,
                            gameId,
                            progressDelegate) {
  const rootPath = files.find(file => file.endsWith(NATIVES_DIR));
  const idx = rootPath.length - NATIVES_DIR.length;
  // Remove directories and anything that isn't in the rootPath.
  let filtered = files.filter(file =>
    ((file.indexOf(rootPath) !== -1)
      && (!file.endsWith(path.sep))));

  filtered = filtered.map(file => {
    return {
      source: file,
      destination: file.substr(idx),
    };
  });

  const modTypeInstruction = {
    type: 'setmodtype',
    value: 'mhr-loose-files',
  };
  const instructions = [modTypeInstruction].concat(filtered.map(file => {
    return {
      type: 'copy',
      source: file.source,
      destination: file.destination.toLowerCase(),
    };
  }));

  return Promise.resolve({ instructions });
}

export default function main(context) {
  context.registerReducer(['settings', GAME_ID], reducer);
  const isMHR = (gameId = undefined) => {
    if (gameId !== undefined) {
      return (gameId === GAME_ID);
    }
    const state = context.api.getState();
    const gameMode = selectors.activeGameId(state);
    return (gameMode === GAME_ID);
  };
  const packer = new PackerMod(context.api);
  context.registerGame({
    id: GAME_ID,
    name: 'Monster Hunter Rise',
    compatible: { usvfs: false },
    logo: 'gameart.jpg',
    mergeMods: true,
    queryPath: findGame,
    queryModPath: () => '.',
    executable: () => 'MonsterHunterRise.exe',
    requiredFiles: ['MonsterHunterRise.exe', GAME_PAK_FILE],
    environment: {
      SteamAPPId: STEAM_ID.toString(),
    },
    setup: (discovery) => prepareForModding(context.api, discovery, packer),
  });

  context.registerMigration(old => migrate102(context, old));

  context.registerInstaller('mhr-pak-mod', 25, testSupportedPAK,
    (files) => installPAK(context.api, files, packer));
  context.registerInstaller('mhr-loose-files-installer', 25, testSupportedLoose, installLoose);
  context.registerInstaller('mhr-lua-installer', 25, testSupportedLUA, installLUA);

  context.registerModType('mhr-loose-files', 25, isMHR,
    () => undefined, () => Bluebird.resolve(false), { name: 'Loose Files' });
  context.registerModType('mhr-packer', 25, isMHR,
    () => undefined, () => Bluebird.resolve(false), { name: 'Packer (Do not use)' });
  context.registerModType('mhr-lua-mod', 25, isMHR,
    () => {
      const state = context.api.getState();
      const discovery = selectors.discoveryByGame(state, GAME_ID);
      return path.join(discovery.path, 'reframework');
    }, () => Bluebird.resolve(false), { name: 'Lua Mod' });
  context.once(() => {
    context.api.onAsync('will-deploy',
      async (profileId: string, deployment: IDeployment) => {
        const state: types.IState = context.api.getState();
        const profile = state.persistent.profiles[profileId];
        if (profile?.gameId !== GAME_ID) {
          return;
        }
        const mods = state.persistent.mods[GAME_ID];
        if (mods === undefined) {
          return;
        }
        const looseMods = Object.values(mods).filter(mod => mod.type === 'mhr-loose-files');
        if (looseMods.length === 0) {
          return;
        }
        const packerMod = Object.values(mods).filter(mod => mod.type === 'mhr-packer')?.[0];
        if (packerMod === undefined) {
          return;
        }
        const stagingFolder = selectors.installPathForGame(state, GAME_ID);
        const modFiles = await looseMods.reduce(async (accumP, iter) => {
          let accum = await accumP;
          const modPath = path.join(stagingFolder, iter.installationPath);
          const files = await walkDirPath(modPath);
          accum = accum.concat(files.filter(file => path.extname(file.filePath) !== '')
                                    .map(file => file.filePath));
          return accum;
        }, Promise.resolve([]));
        const copiedFiles = [];
        for (let file of modFiles) {
          const relPath = path.relative(stagingFolder, file)
                              .split(path.sep)
                              .slice(1)
                              .join(path.sep);
          const dest = path.join(stagingFolder, packerMod.installationPath, relPath);
          await fs.ensureDirWritableAsync(path.dirname(dest));
          await fs.linkAsync(file, dest).catch(err => null);
          copiedFiles.push(dest);
        }

        try {
          const pakFile = await packer.runPacker();
          copiedFiles.push(pakFile);
          const mergedModName = 'mergedPak';
          const dest = path.join(stagingFolder, mergedModName, path.basename(pakFile));
          await fs.removeAsync(dest).catch(err => null);
          await packer.createMergedMod(mergedModName);
          await fs.linkAsync(pakFile, dest).catch(err => null);
        } catch (err) {
          context.api.showErrorNotification('Failed to merge loose files', err);
        }

        // Cleanup
        for (let file of copiedFiles) {
          await fs.removeAsync(file);
        }
    });
  });
}
