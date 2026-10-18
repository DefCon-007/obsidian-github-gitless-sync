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

test("mkdir runs even when exists() reports a false positive", async () => {
  // Reproduces the Android force-pull FILE_NOTCREATED bug: the native adapter
  // can report a directory under the hidden config dir as existing when it was
  // never physically created. Guarding mkdir with exists() would skip the
  // creation and leave later writeBinary calls writing into a missing folder.
  const created = new Set<string>();
  const ensurer = new DirectoryEnsurer({
    async exists() {
      // Always claims the path exists, mimicking the false positive.
      return true;
    },
    async mkdir(path) {
      created.add(path);
    },
  });

  await ensurer.ensure(".obsidian/github-sync-force-pull-staging/Notes");

  assert.deepEqual(
    [...created],
    [
      ".obsidian",
      ".obsidian/github-sync-force-pull-staging",
      ".obsidian/github-sync-force-pull-staging/Notes",
    ],
  );
});

test("an already-exists mkdir rejection is tolerated when the directory is present", async () => {
  // Android's adapter may reject mkdir for a directory that genuinely exists.
  // The ensurer should treat that as success rather than propagating the error.
  const ensurer = new DirectoryEnsurer({
    async exists() {
      return true;
    },
    async mkdir() {
      throw new Error("FILE_NOTCREATED");
    },
  });

  await assert.doesNotReject(ensurer.ensure("Projects/Alpha"));
});
