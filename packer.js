"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackerMod = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const vortex_api_1 = require("vortex-api");
const actions_1 = require("./actions");
const common_1 = require("./common");
const patchRgx = new RegExp(/re_chunk_000.pak.patch_[0-9]*.pak/, 'gm');
class PackerMod {
    constructor(api) {
        this.mApi = api;
    }
    ensurePacker() {
        return __awaiter(this, void 0, void 0, function* () {
            const state = this.mApi.getState();
            const discovery = state.settings.gameMode.discovered[common_1.GAME_ID];
            if (!(discovery === null || discovery === void 0 ? void 0 : discovery.path)) {
                return Promise.reject(new vortex_api_1.util.ProcessCanceled('Game is not discovered'));
            }
            const stagingPath = vortex_api_1.selectors.installPathForGame(state, common_1.GAME_ID);
            const modName = 'Packer';
            let mod = vortex_api_1.util.getSafe(state, ['persistent', 'mods', common_1.GAME_ID, modName], undefined);
            if (mod === undefined) {
                try {
                    yield this.createPackerMod(modName);
                    mod = vortex_api_1.util.getSafe(this.mApi.getState(), ['persistent', 'mods', common_1.GAME_ID, modName], undefined);
                    const modInstallPath = path_1.default.join(stagingPath, mod.installationPath);
                    for (let file of common_1.PACKER_FILES) {
                        try {
                            yield vortex_api_1.fs.copyAsync(path_1.default.join(common_1.PACKER_DIR, file), path_1.default.join(modInstallPath, file));
                        }
                        catch (err) {
                            if ((err === null || err === void 0 ? void 0 : err.code) !== 'EEXIST') {
                                throw err;
                            }
                        }
                    }
                }
                catch (err) {
                    return Promise.reject(err);
                }
            }
            return Promise.resolve(modName);
        });
    }
    runPacker() {
        let isClosed = false;
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            let returned = false;
            const state = this.mApi.getState();
            const stagingFolder = vortex_api_1.selectors.installPathForGame(state, common_1.GAME_ID);
            const discovery = vortex_api_1.selectors.discoveryByGame(state, common_1.GAME_ID);
            const modName = 'Packer';
            const mod = vortex_api_1.util.getSafe(state, ['persistent', 'mods', common_1.GAME_ID, modName], undefined);
            if (mod === undefined || (discovery === null || discovery === void 0 ? void 0 : discovery.path) === undefined) {
                return Promise.reject(new vortex_api_1.util.ProcessCanceled('Game not discovered or packer mod not installed'));
            }
            const patchSuffix = yield this.getLatestPatch(this.mApi, discovery);
            const patchFileName = `re_chunk_000.pak.patch_${patchSuffix}.pak`;
            const pakFilePath = path_1.default.join(stagingFolder, mod.installationPath, patchFileName);
            yield vortex_api_1.fs.removeAsync(pakFilePath).catch(err => null);
            const packerPath = path_1.default.join(stagingFolder, mod.installationPath);
            const exe = path_1.default.join(packerPath, common_1.PACKER_FILES[0]);
            const args = [`${packerPath}`, `${packerPath}\\${path_1.default.basename(pakFilePath)}`];
            const proc = (0, child_process_1.spawn)(exe, args);
            proc.stdout.on('data', data => {
                const formatted = data.toString('utf8').split('\n');
                for (let line of formatted) {
                    if (line.toLowerCase().indexOf('press enter to exit')) {
                        if (!isClosed) {
                            proc.stdin.write('\x0D', (err) => null);
                        }
                    }
                }
            });
            proc.stderr.on('data', data => (0, vortex_api_1.log)('warn', data));
            proc.on('error', (errIn) => {
                isClosed = true;
                if (!returned) {
                    returned = true;
                    const err = new Error(`${common_1.PACKER_FILES[0]} failed: ` + errIn.message);
                    err['attachLogOnReport'] = true;
                    reject(err);
                }
            });
            proc.on('exit', (code) => {
                isClosed = true;
                if (!returned) {
                    returned = true;
                    if (code === 0) {
                        return resolve(pakFilePath);
                    }
                    else {
                        const err = new Error(`${common_1.PACKER_FILES[0]} failed: ${code}`);
                        err['attachLogOnReport'] = true;
                        return reject(err);
                    }
                }
            });
        }));
    }
    createMergedMod(modName) {
        const mod = {
            id: modName,
            state: 'installed',
            attributes: {
                name: 'Merged Mod',
                description: 'This mod contains a .pak file that is the merged result of '
                    + 'all mods with loose files.',
                logicalFileName: 'Merged Mod',
                modId: 42,
                version: '1.0.0',
                installTime: new Date(),
            },
            installationPath: modName,
            type: '',
        };
        return this.createMod(mod, modName);
    }
    getNextPatch(api) {
        return __awaiter(this, void 0, void 0, function* () {
            const state = api.getState();
            const discovery = vortex_api_1.selectors.discoveryByGame(state, common_1.GAME_ID);
            const latestPatch = yield this.getLatestPatch(api, discovery, false);
            const nextPatch = parseInt(latestPatch, 10) + 1;
            const value = nextPatch.toString();
            return value.split('').length < 3
                ? Promise.resolve(value.padStart(3, '0'))
                : Promise.resolve(value);
        });
    }
    getLatestPatch(api, discovery, findMergedPak = true) {
        return __awaiter(this, void 0, void 0, function* () {
            const state = api.getState();
            const currentPatch = vortex_api_1.util.getSafe(state, ['settings', common_1.GAME_ID, 'patch'], '000');
            try {
                let foundLink = false;
                const entries = yield vortex_api_1.fs.readdirAsync(discovery.path);
                const filtered = entries.filter(entry => patchRgx.test(entry));
                if (filtered.length > 0) {
                    const maxValue = yield filtered.reduce((prevP, iter) => __awaiter(this, void 0, void 0, function* () {
                        let prev = yield prevP;
                        if (foundLink) {
                            return prev;
                        }
                        const value = path_1.default.basename(iter, '.pak')
                            .replace('re_chunk_000.pak.patch_', '');
                        const stats = yield vortex_api_1.fs.statAsync(path_1.default.join(discovery.path, iter));
                        if (findMergedPak && stats.isSymbolicLink() || stats.nlink > 1) {
                            prev = value;
                            foundLink = true;
                            return prev;
                        }
                        if (parseInt(value, 10) > parseInt(prev, 10)) {
                            prev = value;
                        }
                        return prev;
                    }), Promise.resolve('000'));
                    if (maxValue !== currentPatch) {
                        api.store.dispatch((0, actions_1.setLatestPatch)(maxValue));
                        return Promise.resolve(maxValue);
                    }
                }
                return Promise.resolve(currentPatch);
            }
            catch (err) {
                api.showErrorNotification('Failed to ascertain current patch value', err);
                return Promise.resolve(currentPatch);
            }
        });
    }
    createMod(mod, modName) {
        return new Promise((resolve, reject) => {
            this.mApi.events.emit('create-mod', common_1.GAME_ID, mod, (error) => __awaiter(this, void 0, void 0, function* () {
                if (error !== null) {
                    return reject(error);
                }
                const profileId = vortex_api_1.selectors.lastActiveProfileForGame(this.mApi.getState(), common_1.GAME_ID);
                this.mApi.store.dispatch(vortex_api_1.actions.setModEnabled(profileId, modName, true));
                return resolve();
            }));
        });
    }
    createPackerMod(modName) {
        const mod = {
            id: modName,
            state: 'installed',
            attributes: {
                name: 'Packer',
                description: 'This "mod" is in fact a tool Vortex uses to merge loose files - '
                    + 'please keep it enabled and deployed.',
                logicalFileName: 'Packer',
                modId: 42,
                version: '1.0.0',
                installTime: new Date(),
            },
            installationPath: modName,
            type: 'mhr-packer',
        };
        return this.createMod(mod, modName);
    }
}
exports.PackerMod = PackerMod;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFja2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicGFja2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFzQztBQUV0QyxnREFBd0I7QUFDeEIsMkNBQXNFO0FBRXRFLHVDQUEyQztBQUMzQyxxQ0FBNkQ7QUFFN0QsTUFBTSxRQUFRLEdBQUcsSUFBSSxNQUFNLENBQUMsbUNBQW1DLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFFdkUsTUFBYSxTQUFTO0lBR3BCLFlBQVksR0FBd0I7UUFDbEMsSUFBSSxDQUFDLElBQUksR0FBRyxHQUFHLENBQUM7SUFDbEIsQ0FBQztJQUVZLFlBQVk7O1lBQ3ZCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbkMsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLGdCQUFPLENBQUMsQ0FBQztZQUM5RCxJQUFJLENBQUMsQ0FBQSxTQUFTLGFBQVQsU0FBUyx1QkFBVCxTQUFTLENBQUUsSUFBSSxDQUFBLEVBQUU7Z0JBQ3BCLE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLGlCQUFJLENBQUMsZUFBZSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQzthQUMzRTtZQUNELE1BQU0sV0FBVyxHQUFHLHNCQUFTLENBQUMsa0JBQWtCLENBQUMsS0FBSyxFQUFFLGdCQUFPLENBQUMsQ0FBQztZQUNqRSxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUM7WUFDekIsSUFBSSxHQUFHLEdBQWUsaUJBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUMsWUFBWSxFQUFFLE1BQU0sRUFBRSxnQkFBTyxFQUFFLE9BQU8sQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQy9GLElBQUksR0FBRyxLQUFLLFNBQVMsRUFBRTtnQkFDckIsSUFBSTtvQkFDRixNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQ3BDLEdBQUcsR0FBRyxpQkFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUNyQyxDQUFDLFlBQVksRUFBRSxNQUFNLEVBQUUsZ0JBQU8sRUFBRSxPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztvQkFDdkQsTUFBTSxjQUFjLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLGdCQUFnQixDQUFDLENBQUM7b0JBQ3BFLEtBQUssSUFBSSxJQUFJLElBQUkscUJBQVksRUFBRTt3QkFDN0IsSUFBSTs0QkFDRixNQUFNLGVBQUUsQ0FBQyxTQUFTLENBQUMsY0FBSSxDQUFDLElBQUksQ0FBQyxtQkFBVSxFQUFFLElBQUksQ0FBQyxFQUFFLGNBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7eUJBQ2xGO3dCQUFDLE9BQU8sR0FBRyxFQUFFOzRCQUNaLElBQUksQ0FBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsSUFBSSxNQUFLLFFBQVEsRUFBRTtnQ0FDMUIsTUFBTSxHQUFHLENBQUM7NkJBQ1g7eUJBQ0Y7cUJBQ0Y7aUJBQ0Y7Z0JBQUMsT0FBTyxHQUFHLEVBQUU7b0JBQ1osT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2lCQUM1QjthQUNGO1lBRUQsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2xDLENBQUM7S0FBQTtJQUVNLFNBQVM7UUFDZCxJQUFJLFFBQVEsR0FBWSxLQUFLLENBQUM7UUFDOUIsT0FBTyxJQUFJLE9BQU8sQ0FBUyxDQUFPLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUNuRCxJQUFJLFFBQVEsR0FBWSxLQUFLLENBQUM7WUFFOUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNuQyxNQUFNLGFBQWEsR0FBRyxzQkFBUyxDQUFDLGtCQUFrQixDQUFDLEtBQUssRUFBRSxnQkFBTyxDQUFDLENBQUM7WUFDbkUsTUFBTSxTQUFTLEdBQUcsc0JBQVMsQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLGdCQUFPLENBQUMsQ0FBQztZQUM1RCxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUM7WUFDekIsTUFBTSxHQUFHLEdBQWUsaUJBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUN0QyxDQUFDLFlBQVksRUFBRSxNQUFNLEVBQUUsZ0JBQU8sRUFBRSxPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN6RCxJQUFJLEdBQUcsS0FBSyxTQUFTLElBQUksQ0FBQSxTQUFTLGFBQVQsU0FBUyx1QkFBVCxTQUFTLENBQUUsSUFBSSxNQUFLLFNBQVMsRUFBRTtnQkFDdEQsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksaUJBQUksQ0FBQyxlQUFlLENBQUMsaURBQWlELENBQUMsQ0FBQyxDQUFDO2FBQ3BHO1lBQ0QsTUFBTSxXQUFXLEdBQUcsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDcEUsTUFBTSxhQUFhLEdBQUcsMEJBQTBCLFdBQVcsTUFBTSxDQUFDO1lBQ2xFLE1BQU0sV0FBVyxHQUFHLGNBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNsRixNQUFNLGVBQUUsQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckQsTUFBTSxVQUFVLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsR0FBRyxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDbEUsTUFBTSxHQUFHLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUscUJBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ25ELE1BQU0sSUFBSSxHQUFHLENBQUMsR0FBRyxVQUFVLEVBQUUsRUFBRSxHQUFHLFVBQVUsS0FBSyxjQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMvRSxNQUFNLElBQUksR0FBRyxJQUFBLHFCQUFLLEVBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBRTlCLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsRUFBRTtnQkFDNUIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3BELEtBQUssSUFBSSxJQUFJLElBQUksU0FBUyxFQUFFO29CQUMxQixJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxPQUFPLENBQUMscUJBQXFCLENBQUMsRUFBRTt3QkFDckQsSUFBSSxDQUFDLFFBQVEsRUFBRTs0QkFDYixJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFVLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO3lCQUNoRDtxQkFDRjtpQkFDRjtZQUNILENBQUMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBQSxnQkFBRyxFQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBRWxELElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsS0FBWSxFQUFFLEVBQUU7Z0JBQ2hDLFFBQVEsR0FBRyxJQUFJLENBQUM7Z0JBQ2hCLElBQUksQ0FBQyxRQUFRLEVBQUU7b0JBQ2IsUUFBUSxHQUFHLElBQUksQ0FBQztvQkFDaEIsTUFBTSxHQUFHLEdBQUcsSUFBSSxLQUFLLENBQUMsR0FBRyxxQkFBWSxDQUFDLENBQUMsQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUNyRSxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxJQUFJLENBQUM7b0JBQ2hDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztpQkFDYjtZQUNILENBQUMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFZLEVBQUUsRUFBRTtnQkFDL0IsUUFBUSxHQUFHLElBQUksQ0FBQztnQkFDaEIsSUFBSSxDQUFDLFFBQVEsRUFBRTtvQkFDYixRQUFRLEdBQUcsSUFBSSxDQUFDO29CQUNoQixJQUFJLElBQUksS0FBSyxDQUFDLEVBQUU7d0JBQ2QsT0FBTyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7cUJBQzdCO3lCQUFNO3dCQUNMLE1BQU0sR0FBRyxHQUFHLElBQUksS0FBSyxDQUFDLEdBQUcscUJBQVksQ0FBQyxDQUFDLENBQUMsWUFBWSxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUM1RCxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxJQUFJLENBQUM7d0JBQ2hDLE9BQU8sTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO3FCQUNwQjtpQkFDRjtZQUNILENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFBLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTSxlQUFlLENBQUMsT0FBZTtRQUNwQyxNQUFNLEdBQUcsR0FBZTtZQUN0QixFQUFFLEVBQUUsT0FBTztZQUNYLEtBQUssRUFBRSxXQUFXO1lBQ2xCLFVBQVUsRUFBRTtnQkFDVixJQUFJLEVBQUUsWUFBWTtnQkFDbEIsV0FBVyxFQUFFLDZEQUE2RDtzQkFDN0QsNEJBQTRCO2dCQUN6QyxlQUFlLEVBQUUsWUFBWTtnQkFDN0IsS0FBSyxFQUFFLEVBQUU7Z0JBQ1QsT0FBTyxFQUFFLE9BQU87Z0JBQ2hCLFdBQVcsRUFBRSxJQUFJLElBQUksRUFBRTthQUN4QjtZQUNELGdCQUFnQixFQUFFLE9BQU87WUFDekIsSUFBSSxFQUFFLEVBQUU7U0FDVCxDQUFDO1FBRUYsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRVksWUFBWSxDQUFDLEdBQXdCOztZQUNoRCxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDN0IsTUFBTSxTQUFTLEdBQUcsc0JBQVMsQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLGdCQUFPLENBQUMsQ0FBQztZQUM1RCxNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNyRSxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNoRCxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbkMsT0FBTyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDO2dCQUMvQixDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztnQkFDekMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0IsQ0FBQztLQUFBO0lBRWEsY0FBYyxDQUFDLEdBQXdCLEVBQ3hCLFNBQWlDLEVBQ2pDLGdCQUF5QixJQUFJOztZQUN4RCxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDN0IsTUFBTSxZQUFZLEdBQUcsaUJBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUMsVUFBVSxFQUFFLGdCQUFPLEVBQUUsT0FBTyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDaEYsSUFBSTtnQkFDRixJQUFJLFNBQVMsR0FBRyxLQUFLLENBQUM7Z0JBQ3RCLE1BQU0sT0FBTyxHQUFHLE1BQU0sZUFBRSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3RELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQy9ELElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7b0JBQ3ZCLE1BQU0sUUFBUSxHQUFHLE1BQU0sUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFPLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRTt3QkFDM0QsSUFBSSxJQUFJLEdBQUcsTUFBTSxLQUFLLENBQUM7d0JBQ3ZCLElBQUksU0FBUyxFQUFFOzRCQUNiLE9BQU8sSUFBSSxDQUFDO3lCQUNiO3dCQUNELE1BQU0sS0FBSyxHQUFHLGNBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQzs2QkFDdEIsT0FBTyxDQUFDLHlCQUF5QixFQUFFLEVBQUUsQ0FBQyxDQUFDO3dCQUMxRCxNQUFNLEtBQUssR0FBRyxNQUFNLGVBQUUsQ0FBQyxTQUFTLENBQUMsY0FBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7d0JBQ2xFLElBQUksYUFBYSxJQUFJLEtBQUssQ0FBQyxjQUFjLEVBQUUsSUFBSSxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsRUFBRTs0QkFFOUQsSUFBSSxHQUFHLEtBQUssQ0FBQzs0QkFDYixTQUFTLEdBQUcsSUFBSSxDQUFDOzRCQUNqQixPQUFPLElBQUksQ0FBQzt5QkFDYjt3QkFDRCxJQUFJLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEdBQUcsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsRUFBRTs0QkFDNUMsSUFBSSxHQUFHLEtBQUssQ0FBQzt5QkFDZDt3QkFDRCxPQUFPLElBQUksQ0FBQztvQkFDZCxDQUFDLENBQUEsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQzNCLElBQUksUUFBUSxLQUFLLFlBQVksRUFBRTt3QkFDN0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBQSx3QkFBYyxFQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7d0JBQzdDLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztxQkFDbEM7aUJBQ0Y7Z0JBRUQsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO2FBQ3RDO1lBQUMsT0FBTyxHQUFHLEVBQUU7Z0JBQ1osR0FBRyxDQUFDLHFCQUFxQixDQUFDLHlDQUF5QyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUMxRSxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7YUFDdEM7UUFDSCxDQUFDO0tBQUE7SUFFTyxTQUFTLENBQUMsR0FBZSxFQUFFLE9BQWU7UUFDaEQsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLGdCQUFPLEVBQUUsR0FBRyxFQUFFLENBQU8sS0FBSyxFQUFFLEVBQUU7Z0JBQ2hFLElBQUksS0FBSyxLQUFLLElBQUksRUFBRTtvQkFDbEIsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7aUJBQ3RCO2dCQUNELE1BQU0sU0FBUyxHQUFHLHNCQUFTLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSxnQkFBTyxDQUFDLENBQUM7Z0JBQ3BGLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxvQkFBTyxDQUFDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQzFFLE9BQU8sT0FBTyxFQUFFLENBQUM7WUFDbkIsQ0FBQyxDQUFBLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLGVBQWUsQ0FBQyxPQUFlO1FBQ3JDLE1BQU0sR0FBRyxHQUFlO1lBQ3RCLEVBQUUsRUFBRSxPQUFPO1lBQ1gsS0FBSyxFQUFFLFdBQVc7WUFDbEIsVUFBVSxFQUFFO2dCQUNWLElBQUksRUFBRSxRQUFRO2dCQUNkLFdBQVcsRUFBRSxrRUFBa0U7c0JBQ2xFLHNDQUFzQztnQkFDbkQsZUFBZSxFQUFFLFFBQVE7Z0JBQ3pCLEtBQUssRUFBRSxFQUFFO2dCQUNULE9BQU8sRUFBRSxPQUFPO2dCQUNoQixXQUFXLEVBQUUsSUFBSSxJQUFJLEVBQUU7YUFDeEI7WUFDRCxnQkFBZ0IsRUFBRSxPQUFPO1lBQ3pCLElBQUksRUFBRSxZQUFZO1NBQ25CLENBQUM7UUFFRixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3RDLENBQUM7Q0FDRjtBQTVNRCw4QkE0TUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBzcGF3biB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xyXG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xyXG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcclxuaW1wb3J0IHsgYWN0aW9ucywgZnMsIGxvZywgc2VsZWN0b3JzLCB0eXBlcywgdXRpbCB9IGZyb20gJ3ZvcnRleC1hcGknO1xyXG5cclxuaW1wb3J0IHsgc2V0TGF0ZXN0UGF0Y2ggfSBmcm9tICcuL2FjdGlvbnMnO1xyXG5pbXBvcnQgeyBHQU1FX0lELCBQQUNLRVJfRElSLCBQQUNLRVJfRklMRVMgfSBmcm9tICcuL2NvbW1vbic7XHJcblxyXG5jb25zdCBwYXRjaFJneCA9IG5ldyBSZWdFeHAoL3JlX2NodW5rXzAwMC5wYWsucGF0Y2hfWzAtOV0qLnBhay8sICdnbScpO1xyXG5cclxuZXhwb3J0IGNsYXNzIFBhY2tlck1vZCB7XHJcbiAgcHJpdmF0ZSBtQXBpOiB0eXBlcy5JRXh0ZW5zaW9uQXBpO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcGk6IHR5cGVzLklFeHRlbnNpb25BcGkpIHtcclxuICAgIHRoaXMubUFwaSA9IGFwaTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBhc3luYyBlbnN1cmVQYWNrZXIoKSB7XHJcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMubUFwaS5nZXRTdGF0ZSgpO1xyXG4gICAgY29uc3QgZGlzY292ZXJ5ID0gc3RhdGUuc2V0dGluZ3MuZ2FtZU1vZGUuZGlzY292ZXJlZFtHQU1FX0lEXTtcclxuICAgIGlmICghZGlzY292ZXJ5Py5wYXRoKSB7XHJcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgdXRpbC5Qcm9jZXNzQ2FuY2VsZWQoJ0dhbWUgaXMgbm90IGRpc2NvdmVyZWQnKSk7XHJcbiAgICB9XHJcbiAgICBjb25zdCBzdGFnaW5nUGF0aCA9IHNlbGVjdG9ycy5pbnN0YWxsUGF0aEZvckdhbWUoc3RhdGUsIEdBTUVfSUQpO1xyXG4gICAgY29uc3QgbW9kTmFtZSA9ICdQYWNrZXInO1xyXG4gICAgbGV0IG1vZDogdHlwZXMuSU1vZCA9IHV0aWwuZ2V0U2FmZShzdGF0ZSwgWydwZXJzaXN0ZW50JywgJ21vZHMnLCBHQU1FX0lELCBtb2ROYW1lXSwgdW5kZWZpbmVkKTtcclxuICAgIGlmIChtb2QgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMuY3JlYXRlUGFja2VyTW9kKG1vZE5hbWUpO1xyXG4gICAgICAgIG1vZCA9IHV0aWwuZ2V0U2FmZSh0aGlzLm1BcGkuZ2V0U3RhdGUoKSxcclxuICAgICAgICAgIFsncGVyc2lzdGVudCcsICdtb2RzJywgR0FNRV9JRCwgbW9kTmFtZV0sIHVuZGVmaW5lZCk7XHJcbiAgICAgICAgY29uc3QgbW9kSW5zdGFsbFBhdGggPSBwYXRoLmpvaW4oc3RhZ2luZ1BhdGgsIG1vZC5pbnN0YWxsYXRpb25QYXRoKTtcclxuICAgICAgICBmb3IgKGxldCBmaWxlIG9mIFBBQ0tFUl9GSUxFUykge1xyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgYXdhaXQgZnMuY29weUFzeW5jKHBhdGguam9pbihQQUNLRVJfRElSLCBmaWxlKSwgcGF0aC5qb2luKG1vZEluc3RhbGxQYXRoLCBmaWxlKSk7XHJcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgaWYgKGVycj8uY29kZSAhPT0gJ0VFWElTVCcpIHtcclxuICAgICAgICAgICAgICB0aHJvdyBlcnI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShtb2ROYW1lKTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBydW5QYWNrZXIoKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGxldCBpc0Nsb3NlZDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oYXN5bmMgKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICBsZXQgcmV0dXJuZWQ6IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgICAgIGNvbnN0IHN0YXRlID0gdGhpcy5tQXBpLmdldFN0YXRlKCk7XHJcbiAgICAgIGNvbnN0IHN0YWdpbmdGb2xkZXIgPSBzZWxlY3RvcnMuaW5zdGFsbFBhdGhGb3JHYW1lKHN0YXRlLCBHQU1FX0lEKTtcclxuICAgICAgY29uc3QgZGlzY292ZXJ5ID0gc2VsZWN0b3JzLmRpc2NvdmVyeUJ5R2FtZShzdGF0ZSwgR0FNRV9JRCk7XHJcbiAgICAgIGNvbnN0IG1vZE5hbWUgPSAnUGFja2VyJztcclxuICAgICAgY29uc3QgbW9kOiB0eXBlcy5JTW9kID0gdXRpbC5nZXRTYWZlKHN0YXRlLFxyXG4gICAgICAgICAgWydwZXJzaXN0ZW50JywgJ21vZHMnLCBHQU1FX0lELCBtb2ROYW1lXSwgdW5kZWZpbmVkKTtcclxuICAgICAgaWYgKG1vZCA9PT0gdW5kZWZpbmVkIHx8IGRpc2NvdmVyeT8ucGF0aCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyB1dGlsLlByb2Nlc3NDYW5jZWxlZCgnR2FtZSBub3QgZGlzY292ZXJlZCBvciBwYWNrZXIgbW9kIG5vdCBpbnN0YWxsZWQnKSk7XHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgcGF0Y2hTdWZmaXggPSBhd2FpdCB0aGlzLmdldExhdGVzdFBhdGNoKHRoaXMubUFwaSwgZGlzY292ZXJ5KTtcclxuICAgICAgY29uc3QgcGF0Y2hGaWxlTmFtZSA9IGByZV9jaHVua18wMDAucGFrLnBhdGNoXyR7cGF0Y2hTdWZmaXh9LnBha2A7XHJcbiAgICAgIGNvbnN0IHBha0ZpbGVQYXRoID0gcGF0aC5qb2luKHN0YWdpbmdGb2xkZXIsIG1vZC5pbnN0YWxsYXRpb25QYXRoLCBwYXRjaEZpbGVOYW1lKTtcclxuICAgICAgYXdhaXQgZnMucmVtb3ZlQXN5bmMocGFrRmlsZVBhdGgpLmNhdGNoKGVyciA9PiBudWxsKTtcclxuICAgICAgY29uc3QgcGFja2VyUGF0aCA9IHBhdGguam9pbihzdGFnaW5nRm9sZGVyLCBtb2QuaW5zdGFsbGF0aW9uUGF0aCk7XHJcbiAgICAgIGNvbnN0IGV4ZSA9IHBhdGguam9pbihwYWNrZXJQYXRoLCBQQUNLRVJfRklMRVNbMF0pO1xyXG4gICAgICBjb25zdCBhcmdzID0gW2Ake3BhY2tlclBhdGh9YCwgYCR7cGFja2VyUGF0aH1cXFxcJHtwYXRoLmJhc2VuYW1lKHBha0ZpbGVQYXRoKX1gXTtcclxuICAgICAgY29uc3QgcHJvYyA9IHNwYXduKGV4ZSwgYXJncyk7XHJcblxyXG4gICAgICBwcm9jLnN0ZG91dC5vbignZGF0YScsIGRhdGEgPT4ge1xyXG4gICAgICAgIGNvbnN0IGZvcm1hdHRlZCA9IGRhdGEudG9TdHJpbmcoJ3V0ZjgnKS5zcGxpdCgnXFxuJyk7XHJcbiAgICAgICAgZm9yIChsZXQgbGluZSBvZiBmb3JtYXR0ZWQpIHtcclxuICAgICAgICAgIGlmIChsaW5lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZigncHJlc3MgZW50ZXIgdG8gZXhpdCcpKSB7XHJcbiAgICAgICAgICAgIGlmICghaXNDbG9zZWQpIHtcclxuICAgICAgICAgICAgICBwcm9jLnN0ZGluLndyaXRlKCdcXHgwRCcsIChlcnI6IEVycm9yKSA9PiBudWxsKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICAgIHByb2Muc3RkZXJyLm9uKCdkYXRhJywgZGF0YSA9PiBsb2coJ3dhcm4nLCBkYXRhKSk7XHJcblxyXG4gICAgICBwcm9jLm9uKCdlcnJvcicsIChlcnJJbjogRXJyb3IpID0+IHtcclxuICAgICAgICBpc0Nsb3NlZCA9IHRydWU7XHJcbiAgICAgICAgaWYgKCFyZXR1cm5lZCkge1xyXG4gICAgICAgICAgcmV0dXJuZWQgPSB0cnVlO1xyXG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IEVycm9yKGAke1BBQ0tFUl9GSUxFU1swXX0gZmFpbGVkOiBgICsgZXJySW4ubWVzc2FnZSk7XHJcbiAgICAgICAgICBlcnJbJ2F0dGFjaExvZ09uUmVwb3J0J10gPSB0cnVlO1xyXG4gICAgICAgICAgcmVqZWN0KGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgICAgcHJvYy5vbignZXhpdCcsIChjb2RlOiBudW1iZXIpID0+IHtcclxuICAgICAgICBpc0Nsb3NlZCA9IHRydWU7XHJcbiAgICAgICAgaWYgKCFyZXR1cm5lZCkge1xyXG4gICAgICAgICAgcmV0dXJuZWQgPSB0cnVlO1xyXG4gICAgICAgICAgaWYgKGNvZGUgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUocGFrRmlsZVBhdGgpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc3QgZXJyID0gbmV3IEVycm9yKGAke1BBQ0tFUl9GSUxFU1swXX0gZmFpbGVkOiAke2NvZGV9YCk7XHJcbiAgICAgICAgICAgIGVyclsnYXR0YWNoTG9nT25SZXBvcnQnXSA9IHRydWU7XHJcbiAgICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgY3JlYXRlTWVyZ2VkTW9kKG1vZE5hbWU6IHN0cmluZykge1xyXG4gICAgY29uc3QgbW9kOiB0eXBlcy5JTW9kID0ge1xyXG4gICAgICBpZDogbW9kTmFtZSxcclxuICAgICAgc3RhdGU6ICdpbnN0YWxsZWQnLFxyXG4gICAgICBhdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgbmFtZTogJ01lcmdlZCBNb2QnLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBtb2QgY29udGFpbnMgYSAucGFrIGZpbGUgdGhhdCBpcyB0aGUgbWVyZ2VkIHJlc3VsdCBvZiAnXHJcbiAgICAgICAgICAgICAgICAgICArICdhbGwgbW9kcyB3aXRoIGxvb3NlIGZpbGVzLicsXHJcbiAgICAgICAgbG9naWNhbEZpbGVOYW1lOiAnTWVyZ2VkIE1vZCcsXHJcbiAgICAgICAgbW9kSWQ6IDQyLCAvLyBNZWFuaW5nIG9mIGxpZmVcclxuICAgICAgICB2ZXJzaW9uOiAnMS4wLjAnLFxyXG4gICAgICAgIGluc3RhbGxUaW1lOiBuZXcgRGF0ZSgpLFxyXG4gICAgICB9LFxyXG4gICAgICBpbnN0YWxsYXRpb25QYXRoOiBtb2ROYW1lLFxyXG4gICAgICB0eXBlOiAnJyxcclxuICAgIH07XHJcblxyXG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlTW9kKG1vZCwgbW9kTmFtZSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgYXN5bmMgZ2V0TmV4dFBhdGNoKGFwaTogdHlwZXMuSUV4dGVuc2lvbkFwaSkge1xyXG4gICAgY29uc3Qgc3RhdGUgPSBhcGkuZ2V0U3RhdGUoKTtcclxuICAgIGNvbnN0IGRpc2NvdmVyeSA9IHNlbGVjdG9ycy5kaXNjb3ZlcnlCeUdhbWUoc3RhdGUsIEdBTUVfSUQpO1xyXG4gICAgY29uc3QgbGF0ZXN0UGF0Y2ggPSBhd2FpdCB0aGlzLmdldExhdGVzdFBhdGNoKGFwaSwgZGlzY292ZXJ5LCBmYWxzZSk7XHJcbiAgICBjb25zdCBuZXh0UGF0Y2ggPSBwYXJzZUludChsYXRlc3RQYXRjaCwgMTApICsgMTtcclxuICAgIGNvbnN0IHZhbHVlID0gbmV4dFBhdGNoLnRvU3RyaW5nKCk7XHJcbiAgICByZXR1cm4gdmFsdWUuc3BsaXQoJycpLmxlbmd0aCA8IDNcclxuICAgICAgPyBQcm9taXNlLnJlc29sdmUodmFsdWUucGFkU3RhcnQoMywgJzAnKSlcclxuICAgICAgOiBQcm9taXNlLnJlc29sdmUodmFsdWUpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBnZXRMYXRlc3RQYXRjaChhcGk6IHR5cGVzLklFeHRlbnNpb25BcGksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkaXNjb3Zlcnk6IHR5cGVzLklEaXNjb3ZlcnlSZXN1bHQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kTWVyZ2VkUGFrOiBib29sZWFuID0gdHJ1ZSkge1xyXG4gICAgY29uc3Qgc3RhdGUgPSBhcGkuZ2V0U3RhdGUoKTtcclxuICAgIGNvbnN0IGN1cnJlbnRQYXRjaCA9IHV0aWwuZ2V0U2FmZShzdGF0ZSwgWydzZXR0aW5ncycsIEdBTUVfSUQsICdwYXRjaCddLCAnMDAwJyk7XHJcbiAgICB0cnkge1xyXG4gICAgICBsZXQgZm91bmRMaW5rID0gZmFsc2U7XHJcbiAgICAgIGNvbnN0IGVudHJpZXMgPSBhd2FpdCBmcy5yZWFkZGlyQXN5bmMoZGlzY292ZXJ5LnBhdGgpO1xyXG4gICAgICBjb25zdCBmaWx0ZXJlZCA9IGVudHJpZXMuZmlsdGVyKGVudHJ5ID0+IHBhdGNoUmd4LnRlc3QoZW50cnkpKTtcclxuICAgICAgaWYgKGZpbHRlcmVkLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zdCBtYXhWYWx1ZSA9IGF3YWl0IGZpbHRlcmVkLnJlZHVjZShhc3luYyAocHJldlAsIGl0ZXIpID0+IHtcclxuICAgICAgICAgIGxldCBwcmV2ID0gYXdhaXQgcHJldlA7XHJcbiAgICAgICAgICBpZiAoZm91bmRMaW5rKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwcmV2O1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBwYXRoLmJhc2VuYW1lKGl0ZXIsICcucGFrJylcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKCdyZV9jaHVua18wMDAucGFrLnBhdGNoXycsICcnKTtcclxuICAgICAgICAgIGNvbnN0IHN0YXRzID0gYXdhaXQgZnMuc3RhdEFzeW5jKHBhdGguam9pbihkaXNjb3ZlcnkucGF0aCwgaXRlcikpO1xyXG4gICAgICAgICAgaWYgKGZpbmRNZXJnZWRQYWsgJiYgc3RhdHMuaXNTeW1ib2xpY0xpbmsoKSB8fCBzdGF0cy5ubGluayA+IDEpIHtcclxuICAgICAgICAgICAgLy8gVGhpcyBpcyBwcm9iYWJseSBhIGZpbGUgd2UgZGVwbG95ZWQgLSBrZWVwIHRoZSBwYXRjaCBpZHguXHJcbiAgICAgICAgICAgIHByZXYgPSB2YWx1ZTtcclxuICAgICAgICAgICAgZm91bmRMaW5rID0gdHJ1ZTtcclxuICAgICAgICAgICAgcmV0dXJuIHByZXY7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAocGFyc2VJbnQodmFsdWUsIDEwKSA+IHBhcnNlSW50KHByZXYsIDEwKSkge1xyXG4gICAgICAgICAgICBwcmV2ID0gdmFsdWU7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXR1cm4gcHJldjtcclxuICAgICAgICB9LCBQcm9taXNlLnJlc29sdmUoJzAwMCcpKTtcclxuICAgICAgICBpZiAobWF4VmFsdWUgIT09IGN1cnJlbnRQYXRjaCkge1xyXG4gICAgICAgICAgYXBpLnN0b3JlLmRpc3BhdGNoKHNldExhdGVzdFBhdGNoKG1heFZhbHVlKSk7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG1heFZhbHVlKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoY3VycmVudFBhdGNoKTtcclxuICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICBhcGkuc2hvd0Vycm9yTm90aWZpY2F0aW9uKCdGYWlsZWQgdG8gYXNjZXJ0YWluIGN1cnJlbnQgcGF0Y2ggdmFsdWUnLCBlcnIpO1xyXG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGN1cnJlbnRQYXRjaCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNyZWF0ZU1vZChtb2Q6IHR5cGVzLklNb2QsIG1vZE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgdGhpcy5tQXBpLmV2ZW50cy5lbWl0KCdjcmVhdGUtbW9kJywgR0FNRV9JRCwgbW9kLCBhc3luYyAoZXJyb3IpID0+IHtcclxuICAgICAgICBpZiAoZXJyb3IgIT09IG51bGwpIHtcclxuICAgICAgICAgIHJldHVybiByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBwcm9maWxlSWQgPSBzZWxlY3RvcnMubGFzdEFjdGl2ZVByb2ZpbGVGb3JHYW1lKHRoaXMubUFwaS5nZXRTdGF0ZSgpLCBHQU1FX0lEKTtcclxuICAgICAgICB0aGlzLm1BcGkuc3RvcmUuZGlzcGF0Y2goYWN0aW9ucy5zZXRNb2RFbmFibGVkKHByb2ZpbGVJZCwgbW9kTmFtZSwgdHJ1ZSkpO1xyXG4gICAgICAgIHJldHVybiByZXNvbHZlKCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNyZWF0ZVBhY2tlck1vZChtb2ROYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IG1vZDogdHlwZXMuSU1vZCA9IHtcclxuICAgICAgaWQ6IG1vZE5hbWUsXHJcbiAgICAgIHN0YXRlOiAnaW5zdGFsbGVkJyxcclxuICAgICAgYXR0cmlidXRlczoge1xyXG4gICAgICAgIG5hbWU6ICdQYWNrZXInLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBcIm1vZFwiIGlzIGluIGZhY3QgYSB0b29sIFZvcnRleCB1c2VzIHRvIG1lcmdlIGxvb3NlIGZpbGVzIC0gJ1xyXG4gICAgICAgICAgICAgICAgICAgKyAncGxlYXNlIGtlZXAgaXQgZW5hYmxlZCBhbmQgZGVwbG95ZWQuJyxcclxuICAgICAgICBsb2dpY2FsRmlsZU5hbWU6ICdQYWNrZXInLFxyXG4gICAgICAgIG1vZElkOiA0MiwgLy8gTWVhbmluZyBvZiBsaWZlXHJcbiAgICAgICAgdmVyc2lvbjogJzEuMC4wJyxcclxuICAgICAgICBpbnN0YWxsVGltZTogbmV3IERhdGUoKSxcclxuICAgICAgfSxcclxuICAgICAgaW5zdGFsbGF0aW9uUGF0aDogbW9kTmFtZSxcclxuICAgICAgdHlwZTogJ21oci1wYWNrZXInLFxyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVNb2QobW9kLCBtb2ROYW1lKTtcclxuICB9XHJcbn1cclxuIl19