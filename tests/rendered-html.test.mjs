import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the XRPFlow application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>XRPFlow — FXRP treasury payments<\/title>/i);
  assert.match(html, /XRPFlow/);
  assert.match(html, /Treasury/);
  assert.match(html, /Coston2 Testnet/);
  assert.match(html, /FTestXRP/);
  assert.match(html, /New payment/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps test assets and prototype state explicit", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /prototype workspace/i);
  assert.match(html, /Test assets only/i);
  assert.match(html, /has no monetary value/i);
  assert.match(html, /Prototype mode/i);
});
