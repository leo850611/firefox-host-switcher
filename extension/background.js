"use strict";
let config = HostRules.normalize({ enabled: true, headerRules: [] });
let error = "";
let queue = Promise.resolve();

function serial(task) {
  const result = queue.then(task, task);
  queue = result.catch(() => {});
  return result;
}
function state() {
  return { config, error, headerCount: HostRules.activeHeaders(config).length };
}
function publish() {
  const count = HostRules.activeHeaders(config).length;
  browser.browserAction.setBadgeText({ text: error ? "!" : count ? String(count) : "" });
  browser.browserAction.setBadgeBackgroundColor({ color: error ? "#b54728" : "#16745b" });
  browser.runtime.sendMessage({ type: "stateChanged", state: state() }).catch(() => {});
}
const initialized = (async () => {
  try {
    const saved = await browser.storage.local.get("config");
    if (saved.config) {
      config = HostRules.normalize(saved.config);
      // Keep existing header rules and switches, discard obsolete settings.
      if (JSON.stringify(saved.config) !== JSON.stringify(config)) await browser.storage.local.set({ config });
    }
  } catch (cause) { error = `無法讀取設定：${cause.message}`; }
  publish();
})();
async function stable() { await initialized; await queue; }
browser.webRequest.onBeforeSendHeaders.addListener(async details => {
  await stable();
  return HostRules.rewriteHeaders(details, config);
}, { urls: ["<all_urls>"] }, ["blocking", "requestHeaders"]);
browser.runtime.onMessage.addListener((message, sender) => {
  const source = sender.url?.split(/[?#]/u, 1)[0];
  if (sender.id !== browser.runtime.id || ![browser.runtime.getURL("options.html"), browser.runtime.getURL("popup.html")].includes(source)) return undefined;
  if (message?.type === "getState") return stable().then(state);
  if (!["saveConfig", "setEnabled", "setHeadersEnabled"].includes(message?.type)) return undefined;
  return serial(async () => {
    await initialized;
    const next = HostRules.normalize(message.type === "setEnabled" ? { ...config, enabled: message.enabled } : message.type === "setHeadersEnabled" ? { ...config, headersEnabled: message.enabled } : message.config);
    await browser.storage.local.set({ config: next });
    config = next;
    error = "";
    publish();
    return state();
  });
});
