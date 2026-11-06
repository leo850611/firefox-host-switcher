/* Shared by the background page and options page. No dependencies. */
"use strict";
globalThis.HostRules = (() => {
  function domain(value) {
    const raw = String(value ?? "").trim().replace(/\.$/, "");
    if (!raw || /[\s/:?#@\\%*]/u.test(raw)) throw new Error("請輸入完整網域，例如 app.example.test（不含網址、埠號或萬用字元）。");
    let hostname;
    try { hostname = new URL(`http://${raw}/`).hostname.toLowerCase(); }
    catch { throw new Error("網域格式不正確。"); }
    if (hostname.length > 253 || !hostname.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))) {
      throw new Error("網域格式不正確。");
    }
    if (/^[0-9.]+$/u.test(hostname)) throw new Error("網域格式不正確。");
    return hostname;
  }
  function ip(value) {
    const raw = String(value ?? "").trim();
    if (/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/u.test(raw) && raw.split(".").every(part => Number(part) <= 255)) {
      return raw;
    }
    if (raw.includes(":") && /^[0-9a-f:.]+$/iu.test(raw)) {
      let address;
      try { address = new URL(`http://[${raw}]/`).hostname.slice(1, -1); } catch { /* invalid IPv6 */ }
      if (address) {
        return address;
      }
    }
    throw new Error("請輸入有效的 IPv4 或 IPv6，例如 127.0.0.1 或 ::1。");
  }
  function normalize(value) {
    if (!value || typeof value.enabled !== "boolean") throw new Error("設定格式不正確。");
    const headerRules = value.headerRules === undefined ? [] : value.headerRules;
    const headersEnabled = value.headersEnabled === undefined ? true : value.headersEnabled;
    if (!Array.isArray(headerRules) || headerRules.length > 200 || typeof headersEnabled !== "boolean") throw new Error("Host 標頭設定格式不正確，最多可儲存 200 條規則。");
    const seen = new Set();
    return {
      enabled: value.enabled,
      headersEnabled,
      headerRules: headerRules.map(rule => {
        if (!rule || typeof rule.enabled !== "boolean") throw new Error("Host 標頭規則格式不正確。");
        const source = hostname(rule.source);
        if (seen.has(source)) throw new Error(`Host 標頭來源重複：${source}`);
        seen.add(source);
        return { source, host: authority(rule.host), enabled: rule.enabled };
      })
    };
  }
  function hostname(value) {
    const raw = String(value ?? "").trim();
    if (raw.includes(":")) {
      const address = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
      return `[${ip(address)}]`;
    }
    if (/^[0-9.]+$/u.test(raw)) return ip(raw);
    return domain(raw);
  }
  function authority(value) {
    const input = String(value ?? "");
    if (/[\r\n\u0000-\u001f\u007f]/u.test(input)) throw new Error("Host 標頭不能包含換行或控制字元。");
    const raw = input.trim();
    const parts = raw.startsWith("[") ? /^(\[[0-9a-f:.]+\])(?::([0-9]{1,5}))?$/iu.exec(raw) : /^([^:]+)(?::([0-9]{1,5}))?$/u.exec(raw);
    if (!parts) throw new Error("請輸入 Host，例如 vhost.example.test:8080；IPv6 需加上中括號。");
    const host = hostname(parts[1]);
    const port = parts[2] === undefined ? "" : Number(parts[2]);
    if (port !== "" && (port < 1 || port > 65535)) throw new Error("Host 的埠號需介於 1–65535。");
    return host + (port === "" ? "" : `:${port}`);
  }
  function activeHeaders(config) {
    return config.enabled && config.headersEnabled ? config.headerRules.filter(rule => rule.enabled) : [];
  }
  function requestHost(url) {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) return null;
    return parsed.hostname.toLowerCase().replace(/\.$/, "");
  }
  function rewriteHeaders(details, config) {
    const source = requestHost(details.url);
    const rule = activeHeaders(config).find(item => item.source === source);
    if (!rule) return {};
    const headers = [];
    let replaced = false;
    for (const header of details.requestHeaders || []) {
      if (header.name.toLowerCase() !== "host") headers.push({ ...header });
      else if (!replaced) {
        headers.push({ name: header.name, value: rule.host });
        replaced = true;
      }
    }
    if (!replaced) headers.push({ name: "Host", value: rule.host });
    return { requestHeaders: headers };
  }
  return { hostname, authority, normalize, activeHeaders, rewriteHeaders };
})();
