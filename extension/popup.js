"use strict";
(() => {
  const element = id => document.getElementById(id);
  let currentHost = "";
  element("manage").addEventListener("click", async () => {
    try { await browser.runtime.openOptionsPage(); window.close(); }
    catch { element("message").textContent = "無法開啟詳細設定，請重試。"; }
  });
  element("fill-current").addEventListener("click", () => {
    if (!currentHost) return;
    element("header-source").value = currentHost;
    element("header-host").focus();
  });
  document.querySelector(".quick-content").addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing || event.target.type === "checkbox") return;
    const save = event.target.closest("tr")?.querySelector(".save");
    if (save && !save.disabled) { event.preventDefault(); save.click(); }
  });
  browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
    const url = new URL(tabs[0]?.url || "about:blank");
    if (!["http:", "https:"].includes(url.protocol)) return;
    currentHost = HostRules.hostname(url.hostname);
    element("site-name").textContent = `目前網站：${currentHost}`;
    element("site-name").title = currentHost;
    element("current-site").hidden = false;
    if (!element("header-source").value) element("header-source").value = currentHost;
  }).catch(() => {});
})();
