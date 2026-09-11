import { registerSW } from 'virtual:pwa-register';
import { controller, useGame } from './runtime.js';
const updateSW = registerSW({
  onNeedRefresh: () => useGame.setState({ updateAvailable: true }),
  onOfflineReady: () => useGame.setState({ offlineReady: true }),
  onRegisteredSW: () => { void navigator.serviceWorker.ready.then(() => useGame.setState({ offlineReady: true })); },
  onRegisterError: () => useGame.setState({ notice: '离线缓存未就绪；当前仍可在线游玩，请稍后重新打开。' })
});
export async function installUpdate() { await controller.save(); await updateSW(true); }
