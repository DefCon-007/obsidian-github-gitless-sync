import { strict as assert } from "node:assert";
import test from "node:test";
import DirectoryEnsurer from "../src/directory-ensurer";

test("concurrent callers create a directory only once", async () => {
  const directories = new Set<string>();
  let mkdirCalls = 0;
  const ensurer = new DirectoryEnsurer({
    async exists(path) {
      await Promise.resolve();
      return directories.has(path);
    },
    async mkdir(path) {
      mkdirCalls += 1;
      await Promise.resolve();
      directories.add(path);
    },
  });

  await Promise.all([
    ensurer.ensure("Projects"),
    ensurer.ensure("Projects"),
    ensurer.ensure("Projects"),
  ]);

  assert.equal(mkdirCalls, 1);
  assert.deepEqual([...directories], ["Projects"]);
});

test("nested directories are created parent first across concurrent callers", async () => {
  const directories = new Set<string>();
  const creationOrder: string[] = [];
  const ensurer = new DirectoryEnsurer({
    async exists(path) {
      await Promise.resolve();
      return directories.has(path);
    },
    async mkdir(path) {
      const parent = path.split("/").slice(0, -1).join("/");
      assert.ok(parent === "" || directories.has(parent));
      creationOrder.push(path);
      directories.add(path);
    },
  });

  await Promise.all([
    ensurer.ensure("Projects/Alpha/Notes"),
    ensurer.ensure("Projects/Beta"),
    ensurer.ensure("Projects/Alpha"),
  ]);

  assert.equal(
    creationOrder.filter((path) => path === "Projects").length,
    1,
  );
  assert.ok(
    creationOrder.indexOf("Projects") <
      creationOrder.indexOf("Projects/Alpha"),
  );
  assert.ok(
    creationOrder.indexOf("Projects/Alpha") <
      creationOrder.indexOf("Projects/Alpha/Notes"),
  );
});

test("a failed directory creation can be retried", async () => {
  let attempts = 0;
  let exists = false;
  const ensurer = new DirectoryEnsurer({
    async exists() {
      return exists;
    },
    async mkdir() {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary failure");
      }
      exists = true;
    },
  });

  await assert.rejects(ensurer.ensure("Retry"));
  await ensurer.ensure("Retry");

  assert.equal(attempts, 2);
  assert.equal(exists, true);
});
