import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { embed, EMBEDDING_DIMENSIONS, VoyageError } from "../src/lib/voyage";

const vector = (n: number) => Array(EMBEDDING_DIMENSIONS).fill(n);

function reply(body: unknown, init: ResponseInit = {}) {
  return mock.method(globalThis, "fetch", async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), init),
  );
}

let savedKey: string | undefined;
beforeEach(() => {
  savedKey = process.env.VOYAGE_API_KEY;
  process.env.VOYAGE_API_KEY = "test-key";
});
afterEach(() => {
  mock.restoreAll();
  if (savedKey === undefined) delete process.env.VOYAGE_API_KEY;
  else process.env.VOYAGE_API_KEY = savedKey;
});

test("posts to Voyage with the model, input type and key", async () => {
  const fetch = reply({ data: [{ index: 0, embedding: vector(1) }] });
  await embed(["hello"], "query");
  assert.equal(fetch.mock.callCount(), 1);
  const [url, init] = fetch.mock.calls[0].arguments as [string, RequestInit];
  assert.equal(url, "https://api.voyageai.com/v1/embeddings");
  assert.equal(init.method, "POST");
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(init.body as string), { input: ["hello"], model: "voyage-4", input_type: "query" });
});

test("vectors come back in input order", async () => {
  reply({
    data: [
      { index: 2, embedding: vector(3) },
      { index: 0, embedding: vector(1) },
      { index: 1, embedding: vector(2) },
    ],
  });
  const out = await embed(["a", "b", "c"], "document");
  assert.deepEqual(
    out.map((v) => v[0]),
    [1, 2, 3],
  );
});

test("a non-2xx reply throws with the status and Retry-After", async () => {
  reply("slow down", { status: 429, headers: { "Retry-After": "7" } });
  await assert.rejects(embed(["a"], "document"), (err) => {
    assert.ok(err instanceof VoyageError);
    assert.equal(err.status, 429);
    assert.equal(err.retryAfter, 7);
    assert.match(err.message, /429.*slow down/);
    return true;
  });
});

test("the wrong number of vectors throws", async () => {
  reply({ data: [{ index: 0, embedding: vector(1) }] });
  await assert.rejects(embed(["a", "b"], "document"), /1 embeddings for 2 texts/);
});

test("a vector of the wrong length throws", async () => {
  reply({ data: [{ index: 0, embedding: [1, 2, 3] }] });
  await assert.rejects(embed(["a"], "document"), /1024/);
});

test("a missing key throws before anything is sent", async () => {
  delete process.env.VOYAGE_API_KEY;
  const fetch = reply({ data: [] });
  await assert.rejects(embed(["a"], "document"), /VOYAGE_API_KEY/);
  assert.equal(fetch.mock.callCount(), 0);
});
