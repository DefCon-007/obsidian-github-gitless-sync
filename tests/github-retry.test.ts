import { strict as assert } from "node:assert";
import test from "node:test";
import { isRetryableGithubStatus } from "../src/github/retry";

test("GitHub retries transient response statuses", () => {
  assert.equal(isRetryableGithubStatus(408), true);
  assert.equal(isRetryableGithubStatus(429), true);
  assert.equal(isRetryableGithubStatus(500), true);
  assert.equal(isRetryableGithubStatus(503), true);
});

test("GitHub does not retry permanent or concurrency errors", () => {
  assert.equal(isRetryableGithubStatus(401), false);
  assert.equal(isRetryableGithubStatus(404), false);
  assert.equal(isRetryableGithubStatus(409), false);
  assert.equal(isRetryableGithubStatus(422), false);
});
