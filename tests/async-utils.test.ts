import { strict as assert } from "node:assert";
import test from "node:test";
import { mapWithConcurrency, retryUntil } from "../src/async-utils";

test("retryUntil retries thrown transient errors", async () => {
  let attempts = 0;
  const result = await retryUntil(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("temporary network failure");
      }
      return "ok";
    },
    () => true,
    3,
    0,
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("retryUntil stops when a result is accepted", async () => {
  let attempts = 0;
  const result = await retryUntil(
    async () => {
      attempts += 1;
      return attempts;
    },
    (value) => value >= 3,
    5,
    0,
  );

  assert.equal(result, 3);
  assert.equal(attempts, 3);
});

test("mapWithConcurrency preserves order and bounds active work", async () => {
  let active = 0;
  let maximumActive = 0;
  const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await Promise.resolve();
    active -= 1;
    return value * 2;
  });

  assert.deepEqual(result, [2, 4, 6, 8, 10]);
  assert.equal(maximumActive, 2);
});

test("mapWithConcurrency rejects invalid limits", async () => {
  await assert.rejects(
    mapWithConcurrency([1], 0, async (value) => value),
    /positive integer/u,
  );
});
