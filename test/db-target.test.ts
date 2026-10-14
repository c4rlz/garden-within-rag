import { test } from "node:test";
import assert from "node:assert/strict";
import { couldBeSameDatabase, parseDbTarget } from "../src/lib/db-target";

const env = { USER: "gardener" };

test("the default real and sample databases are different", () => {
  assert.equal(couldBeSameDatabase("postgres:///garden_within_rag", "postgres:///garden_within_sample", env), false);
});

test("every local form of the same database name counts as the same database", () => {
  const forms = [
    "postgres:///x",
    "postgres://localhost/x",
    "postgresql://LOCALHOST/x",
    "postgres://127.0.0.1:5432/x",
    "postgres://[::1]/x",
    "postgres:///x?host=/tmp",
    "postgres://%2Ftmp/x",
    "postgres://someone:secret@localhost/x",
  ];
  for (const a of forms) for (const b of forms) assert.equal(couldBeSameDatabase(a, b, env), true, `${a} vs ${b}`);
});

test("a different port on the local server is still refused", () => {
  assert.equal(couldBeSameDatabase("postgres://localhost:5432/x", "postgres://localhost:5433/x", env), true);
  assert.equal(couldBeSameDatabase("postgres:///x", "postgres://127.0.0.1:6543/x", { ...env, PGPORT: "5433" }), true);
});

test("missing parts are filled in the way pg does", () => {
  assert.deepEqual(parseDbTarget("postgres://", { USER: "gardener" }), { server: "local", port: 5432, database: "gardener" });
  assert.deepEqual(parseDbTarget("postgres://db.example.com", { PGDATABASE: "x", PGPORT: "6000" }), {
    server: "db.example.com",
    port: 6000,
    database: "x",
  });
  assert.equal(parseDbTarget("postgres://?user=pat", {})?.database, "pat");
  assert.equal(parseDbTarget("postgres:///x", { PGHOST: "db.example.com" })?.server, "db.example.com");
  assert.equal(parseDbTarget("postgres:///x?host=db.example.com", { PGHOST: "/tmp" })?.server, "db.example.com");
});

test("PGDATABASE filling in a missing name can make two URLs match", () => {
  assert.equal(couldBeSameDatabase("postgres://localhost", "postgres:///garden_within_rag", { PGDATABASE: "garden_within_rag" }), true);
  assert.equal(couldBeSameDatabase("postgres://localhost", "postgres:///garden_within_rag", { USER: "garden_within_rag" }), true);
});

test("PGHOST pointing the URL without a host at a remote server", () => {
  assert.equal(couldBeSameDatabase("postgres:///x", "postgres://localhost/x", { PGHOST: "db.example.com" }), false);
  assert.equal(couldBeSameDatabase("postgres:///x", "postgres://db.example.com/x", { PGHOST: "db.example.com" }), true);
});

test("anything that can't be read is refused", () => {
  for (const bad of ["", "garbage", "garden_within_sample", "socket:/tmp?db=x", "mysql://localhost/y", "/tmp x", "postgres://a,b/y"]) {
    assert.equal(couldBeSameDatabase("postgres:///x", bad, env), true, bad);
    assert.equal(couldBeSameDatabase(bad, "postgres:///x", env), true, bad);
  }
});

test("different remote hosts, or different names, are allowed", () => {
  assert.equal(couldBeSameDatabase("postgres://db-one.example.com/x", "postgres://db-two.example.com/x", env), false);
  assert.equal(couldBeSameDatabase("postgres://db.example.com/x", "postgres:///x", env), false);
  assert.equal(couldBeSameDatabase("postgres://localhost/x", "postgres://localhost/y", env), false);
});
