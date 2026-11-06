"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../extension");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
const headerRule = { source: "127.0.0.1", host: "virtual.example.test:8080", enabled: true };
const headerConfig = { enabled: true, headersEnabled: true, headerRules: [headerRule] };
function harness(seed) {
  let stored = seed === undefined ? undefined : structuredClone(seed);
  let failWrite = false;
  let writes = 0;
  const listeners = () => ({ callback: null, addListener(fn, filter, flags) { this.callback = fn; this.filter = filter; this.flags = flags; } });
  const browser = {
    storage: { local: {
      async get() { return stored === undefined ? {} : { config: structuredClone(stored) }; },
      async set(value) { if (failWrite) throw new Error("simulated storage failure"); stored = plain(value.config); writes++; }
    } },
    browserAction: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    webRequest: { onBeforeSendHeaders: listeners() },
    runtime: {
      id: "firefox-hosts@local.example", onMessage: listeners(),
      getURL(name) { return `moz-extension://test-uuid/${name}`; }, async sendMessage() {}
    }
  };
  Object.defineProperty(browser, "proxy", { get() { throw new Error("Removed API was accessed"); } });
  Object.defineProperty(browser.runtime, "connectNative", { get() { throw new Error("Removed API was accessed"); } });
  const context = vm.createContext({ browser, URL, console });
  vm.runInContext(read("rules.js"), context);
  vm.runInContext(read("background.js"), context);
  const sender = { id: browser.runtime.id, url: browser.runtime.getURL("options.html"), tab: { id: 1 } };
  return {
    browser, rules: context.HostRules,
    send: message => browser.runtime.onMessage.callback(message, sender),
    headers: (url, requestHeaders = [{ name: "Host", value: "original.example.test" }]) => browser.webRequest.onBeforeSendHeaders.callback({ url, requestHeaders }),
    stored: () => stored, writes: () => writes, failWrites: value => { failWrite = value; }
  };
}
(async () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.deepEqual(manifest.permissions, ["storage", "webRequest", "webRequestBlocking", "<all_urls>"]);
  const legacy = { ...headerConfig, rules: [{ domain: "localhost", ip: "obsolete-invalid-value", enabled: true }], obsoleteSecret: "not-retained" };
  const h = harness(legacy);
  const rules = h.rules;
  const migrated = await h.send({ type: "getState" });
  assert.equal(migrated.error, "");
  assert.equal(migrated.headerCount, 1);
  assert.deepEqual(h.stored(), headerConfig); // obsolete mappings never validated or used
  assert.equal(h.writes(), 1);
  assert.deepEqual(Object.keys(migrated.config).sort(), ["enabled", "headerRules", "headersEnabled"]);
  assert.equal(h.browser.webRequest.onBeforeRequest, undefined);
  assert.deepEqual(plain(h.browser.webRequest.onBeforeSendHeaders.flags), ["blocking", "requestHeaders"]);
  assert.deepEqual(plain(rules.normalize({ enabled: false, headersEnabled: false, rules: [] })), { enabled: false, headersEnabled: false, headerRules: [] });
  assert.equal(rules.hostname("APP.Example.Test."), "app.example.test");
  assert.equal(rules.hostname("測試.example"), "xn--g6w251d.example");
  assert.equal(rules.hostname("[::1]"), "[::1]");
  assert.equal(rules.authority("[::1]:8080"), "[::1]:8080");
  assert.equal(rules.authority("測試.example:80"), "xn--g6w251d.example:80");
  for (const value of ["999.1.1.1", "01.1.1.1", "https://foo", "*.example.test", "foo/path", "foo bar", "::no", "::1%en0", "example.test:8080"]) assert.throws(() => rules.hostname(value));
  for (const value of ["foo\r\nX-Injected: yes", "foo\n", "foo:0", "foo:65536", "https://foo", "user@foo", "foo/path", "foo bar", "::1"]) assert.throws(() => rules.authority(value));
  assert.throws(() => rules.normalize({ ...headerConfig, headerRules: [headerRule, headerRule] }));
  assert.throws(() => rules.normalize({ ...headerConfig, headerRules: null }));
  assert.throws(() => rules.normalize({ ...headerConfig, headersEnabled: "yes" }));
  const many = Array.from({ length: 200 }, (_, i) => ({ source: `host${i}.example.test`, host: "virtual.example.test", enabled: true }));
  assert.equal(rules.normalize({ ...headerConfig, headerRules: many }).headerRules.length, 200);
  assert.throws(() => rules.normalize({ ...headerConfig, headerRules: [...many, { ...headerRule }] }));

  const input = [{ name: "hOsT", value: "127.0.0.1" }, { name: "Cookie", value: "session=preserved" }, { name: "Host", binaryValue: [65] }];
  const modified = (await h.headers("http://127.0.0.1:1234/test", input)).requestHeaders;
  assert.deepEqual(plain(modified), [{ name: "hOsT", value: "virtual.example.test:8080" }, { name: "Cookie", value: "session=preserved" }]);
  assert.equal(input[0].value, "127.0.0.1");
  assert.equal((await h.headers("http://127.0.0.1/", [])).requestHeaders[0].name, "Host");
  for (const url of ["http://127.0.0.2/", "http://localhost/", "file:///tmp/test", "not-a-url"]) assert.equal((await h.headers(url)).requestHeaders, undefined);
  assert.equal((await h.headers("wss://127.0.0.1/socket")).requestHeaders[0].value, headerRule.host);
  await h.send({ type: "setHeadersEnabled", enabled: false });
  assert.equal((await h.headers("http://127.0.0.1/")).requestHeaders, undefined);
  await h.send({ type: "setHeadersEnabled", enabled: true });
  await h.send({ type: "setEnabled", enabled: false });
  assert.equal((await h.headers("http://127.0.0.1/")).requestHeaders, undefined);
  await h.send({ type: "setEnabled", enabled: true });
  await h.send({ type: "saveConfig", config: { ...headerConfig, headerRules: [{ ...headerRule, enabled: false }] } });
  assert.equal((await h.headers("http://127.0.0.1/")).requestHeaders, undefined);
  await h.send({ type: "saveConfig", config: { ...headerConfig, headerRules: [{ source: "app.example.test", host: "edited.example.test", enabled: true }] } });
  assert.equal((await h.headers("https://APP.EXAMPLE.TEST./")).requestHeaders[0].value, "edited.example.test");
  assert.equal((await h.headers("https://sub.app.example.test/")).requestHeaders, undefined);
  const before = structuredClone(h.stored());
  await assert.rejects(h.send({ type: "saveConfig", config: { ...headerConfig, headerRules: [{ ...headerRule, host: "foo\r\nInjected: yes" }] } }));
  assert.deepEqual(h.stored(), before);
  h.failWrites(true);
  await assert.rejects(h.send({ type: "setEnabled", enabled: false }), /simulated storage failure/);
  assert.equal((await h.send({ type: "getState" })).config.enabled, true);
  h.failWrites(false);
  await h.send({ type: "saveConfig", config: { ...headerConfig, headerRules: [] } });
  assert.equal((await h.send({ type: "getState" })).headerCount, 0);
  assert.equal(h.browser.runtime.onMessage.callback({ type: "getState" }, { id: "other" }), undefined);
  assert.equal(h.browser.runtime.onMessage.callback({ type: "getState" }, { id: h.browser.runtime.id, url: "https://example.test" }), undefined);
  assert.equal(h.send({ type: "reconnect" }), undefined);
  const fresh = harness();
  assert.equal((await fresh.send({ type: "getState" })).headerCount, 0);
  const paused = harness({ ...legacy, enabled: false, headersEnabled: false });
  const pausedState = await paused.send({ type: "getState" });
  assert.equal(pausedState.config.enabled, false);
  assert.equal(pausedState.config.headersEnabled, false);
  console.log("Passed: header-only permissions, legacy migration, Host rewriting, independent switches, validation and storage-failure recovery.");
})().catch(cause => { console.error(cause); process.exitCode = 1; });
