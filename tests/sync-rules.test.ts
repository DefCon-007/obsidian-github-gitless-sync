import { strict as assert } from "node:assert";
import test from "node:test";
import {
  automaticConflictAction,
  findStaleRemoteMetadataPaths,
  FIRST_SYNC_BOTH_SIDES_ERROR,
  isSyncablePath,
  vaultListingIsEmpty,
} from "../src/sync-rules";

test("a vault with root files is not empty", () => {
  assert.equal(vaultListingIsEmpty(["note.md"], [".obsidian"], ".obsidian"), false);
});

test("a vault with content folders is not empty", () => {
  assert.equal(
    vaultListingIsEmpty([], [".obsidian", "Projects"], ".obsidian"),
    false,
  );
});

test("an otherwise empty vault may contain its config directory", () => {
  assert.equal(vaultListingIsEmpty([], [".obsidian"], ".obsidian"), true);
});

test("the first-sync safety error explains how to proceed", () => {
  assert.match(FIRST_SYNC_BOTH_SIDES_ERROR, /First sync cannot start/u);
  assert.match(FIRST_SYNC_BOTH_SIDES_ERROR, /prevent data loss/u);
  assert.match(FIRST_SYNC_BOTH_SIDES_ERROR, /empty the repository/u);
  assert.match(FIRST_SYNC_BOTH_SIDES_ERROR, /use an empty vault/u);
});

test("active metadata entries missing from the remote tree are stale", () => {
  assert.deepEqual(
    findStaleRemoteMetadataPaths(
      {
        "present.md": { deleted: false },
        "missing.md": { deleted: false },
        "deleted.md": { deleted: true },
      },
      {
        "present.md": { path: "present.md" },
      },
    ),
    ["missing.md"],
  );
});

test("config files are excluded unless config sync is enabled", () => {
  assert.equal(
    isSyncablePath(".obsidian/plugins/example/data.json", ".obsidian", false),
    false,
  );
  assert.equal(
    isSyncablePath(".obsidian/plugins/example/data.json", ".obsidian", true),
    true,
  );
});

test("paths that merely share the config prefix remain syncable", () => {
  assert.equal(
    isSyncablePath(".obsidian-backup/note.md", ".obsidian", false),
    true,
  );
});

test("internal metadata stays syncable while volatile config files do not", () => {
  assert.equal(
    isSyncablePath(
      ".obsidian/github-sync-metadata.json",
      ".obsidian",
      false,
    ),
    true,
  );
  assert.equal(
    isSyncablePath(".obsidian/workspace.json", ".obsidian", true),
    false,
  );
  assert.equal(
    isSyncablePath(".obsidian/workspace-mobile.json", ".obsidian", true),
    false,
  );
  assert.equal(
    isSyncablePath(".obsidian/github-sync.log", ".obsidian", true),
    false,
  );
});

test("automatic conflict policies choose the documented direction", () => {
  assert.equal(automaticConflictAction("overwriteLocal"), "download");
  assert.equal(automaticConflictAction("overwriteRemote"), "upload");
  assert.equal(automaticConflictAction("ask"), null);
});
