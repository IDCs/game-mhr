"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reducer = void 0;
const actions_1 = require("./actions");
const vortex_api_1 = require("vortex-api");
exports.reducer = {
    reducers: {
        [actions_1.setLatestPatch]: (state, payload) => vortex_api_1.util.setSafe(state, ['patch'], payload),
    },
    defaults: {
        patch: '000',
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVkdWNlcnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZWR1Y2Vycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx1Q0FBMkM7QUFDM0MsMkNBQXlDO0FBRTVCLFFBQUEsT0FBTyxHQUF1QjtJQUN6QyxRQUFRLEVBQUU7UUFDUixDQUFDLHdCQUFxQixDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQyxpQkFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxPQUFPLENBQUM7S0FDckY7SUFDRCxRQUFRLEVBQUU7UUFDUixLQUFLLEVBQUUsS0FBSztLQUNiO0NBQ0YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHNldExhdGVzdFBhdGNoIH0gZnJvbSAnLi9hY3Rpb25zJztcclxuaW1wb3J0IHsgdHlwZXMsIHV0aWwgfSBmcm9tICd2b3J0ZXgtYXBpJztcclxuXHJcbmV4cG9ydCBjb25zdCByZWR1Y2VyOiB0eXBlcy5JUmVkdWNlclNwZWMgPSB7XHJcbiAgcmVkdWNlcnM6IHtcclxuICAgIFtzZXRMYXRlc3RQYXRjaCBhcyBhbnldOiAoc3RhdGUsIHBheWxvYWQpID0+IHV0aWwuc2V0U2FmZShzdGF0ZSwgWydwYXRjaCddLCBwYXlsb2FkKSxcclxuICB9LFxyXG4gIGRlZmF1bHRzOiB7XHJcbiAgICBwYXRjaDogJzAwMCcsXHJcbiAgfSxcclxufTtcclxuIl19