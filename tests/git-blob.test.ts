import { strict as assert } from "node:assert";
import test from "node:test";
import { calculateGitBlobSha } from "../src/git-blob";

test("Git blob hashing matches Git without expanding binary content", async () => {
  const sha = await calculateGitBlobSha(new TextEncoder().encode("hello\n"));
  assert.equal(sha, "ce013625030ba8dba906f756967f9e9ca394464a");
});
