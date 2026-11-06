"use strict";
const $ = id => document.getElementById(id);
let current;
let busy = true;
function feedback(text, failed = false) { $("message").textContent = text; $("message").classList.toggle("error", failed); }
function setBusy(value) {
  busy = value;
  for (const element of document.querySelectorAll("button, input")) element.disabled = value;
}
function render(state, tables = true) {
  current = state.config;
  $("enabled").checked = current.enabled;
  $("headers-enabled").checked = current.headersEnabled;
  $("status").textContent = state.error ? "設定需要處理" : !current.enabled ? "規則已暫停" : !current.headersEnabled ? "Host 標頭修改已停用" : state.headerCount ? "Host 標頭修改運作中" : "尚未啟用任何規則";
  $("detail").textContent = state.error || `已啟用 ${state.headerCount} 條 Host 標頭規則；變更會套用到後續新請求。`;
  $("header-count").textContent = `${current.headerRules.length} 條規則`;
  if (!tables) return;
  $("header-empty").hidden = Boolean(current.headerRules.length);
  $("header-rules").replaceChildren();
  current.headerRules.forEach((rule, index) => {
    const row = $("header-template").content.firstElementChild.cloneNode(true);
    row.classList.toggle("disabled", !rule.enabled);
    row.querySelector(".rule-source").value = rule.source;
    row.querySelector(".rule-host").value = rule.host;
    const toggle = row.querySelector(".rule-enabled");
    toggle.checked = rule.enabled;
    toggle.setAttribute("aria-label", `啟用 Host 標頭 ${rule.source}`);
    const save = async () => {
      const saved = await commit({ ...current, headerRules: current.headerRules.map((item, i) => i === index ? {
        source: row.querySelector(".rule-source").value,
        host: row.querySelector(".rule-host").value, enabled: toggle.checked
      } : item) });
      if (!saved) toggle.checked = rule.enabled;
    };
    toggle.addEventListener("change", save);
    row.querySelector(".save").addEventListener("click", save);
    row.querySelector(".delete").addEventListener("click", () => commit({ ...current, headerRules: current.headerRules.filter((_, i) => i !== index) }));
    $("header-rules").append(row);
  });
}
async function transmit(message) {
  if (busy) return false;
  setBusy(true);
  try {
    const state = await browser.runtime.sendMessage(message);
    render(state);
    feedback("已套用，下一個符合規則的新請求就會生效。");
    return true;
  } catch (cause) {
    feedback(cause.message, true);
    $("enabled").checked = current.enabled;
    $("headers-enabled").checked = current.headersEnabled;
    return false;
  } finally { setBusy(false); }
}
async function commit(next) {
  try { return await transmit({ type: "saveConfig", config: HostRules.normalize(next) }); }
  catch (cause) { feedback(cause.message, true); return false; }
}
$("header-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (await commit({ ...current, headerRules: [...current.headerRules, { source: $("header-source").value, host: $("header-host").value, enabled: true }] })) {
    $("header-source").value = ""; $("header-host").value = ""; $("header-source").focus();
  }
});
$("enabled").addEventListener("change", () => transmit({ type: "setEnabled", enabled: $("enabled").checked }));
$("headers-enabled").addEventListener("change", () => transmit({ type: "setHeadersEnabled", enabled: $("headers-enabled").checked }));
browser.runtime.onMessage.addListener(message => {
  if (message.type !== "stateChanged" || busy || !current) return;
  const changed = JSON.stringify(current.headerRules) !== JSON.stringify(message.state.config.headerRules);
  render(message.state, changed);
});
browser.runtime.sendMessage({ type: "getState" }).then(state => { render(state); setBusy(false); }).catch(cause => feedback(cause.message, true));
