import { strict as assert } from "node:assert";
import test from "node:test";
import {
  automaticConflictAction,
  determineFileSyncAction,
  findStaleRemoteMetadataPaths,
  FIRST_SYNC_BOTH_SIDES_ERROR,
  hasAndroidUnsafePathSegment,
  isExtractableArchivePath,
  isSyncablePath,
  needsFirstSync,
  shouldDeleteLocalPathForForcePull,
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

test("completed local metadata overrides a stale first-sync setting", () => {
  assert.equal(needsFirstSync(true, 0), true);
  assert.equal(needsFirstSync(true, 1234), false);
  assert.equal(needsFirstSync(false, 0), false);
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
  assert.equal(
    isSyncablePath(
      ".obsidian/github-sync-force-pull-staging/note.md",
      ".obsidian",
      true,
    ),
    false,
  );
});

test("first-sync archive extraction rebuilds rather than downloads metadata", () => {
  assert.equal(
    isExtractableArchivePath(
      ".obsidian/github-sync-metadata.json",
      ".obsidian",
      false,
    ),
    false,
  );
  assert.equal(
    isExtractableArchivePath("Projects/note.md", ".obsidian", false),
    true,
  );
  assert.equal(
    isExtractableArchivePath(
      ".obsidian/plugins/example/data.json",
      ".obsidian",
      true,
    ),
    true,
  );
  assert.equal(
    isExtractableArchivePath(
      ".obsidian/plugins/defcon-github-gitless-sync/main.js",
      ".obsidian",
      true,
      [".obsidian/plugins/defcon-github-gitless-sync"],
    ),
    false,
  );
});

test("force pull deletes synced content but preserves runtime state", () => {
  const protectedPaths = [
    ".obsidian/plugins/defcon-github-gitless-sync",
    ".obsidian/github-sync-metadata.json",
    ".obsidian/github-sync.log",
  ];

  assert.equal(
    shouldDeleteLocalPathForForcePull(
      "Projects/local-only.md",
      ".obsidian",
      false,
      protectedPaths,
    ),
    true,
  );
  assert.equal(
    shouldDeleteLocalPathForForcePull(
      ".obsidian/themes/local/theme.css",
      ".obsidian",
      false,
      protectedPaths,
    ),
    false,
  );
  assert.equal(
    shouldDeleteLocalPathForForcePull(
      ".obsidian/themes/local/theme.css",
      ".obsidian",
      true,
      protectedPaths,
    ),
    true,
  );
  assert.equal(
    shouldDeleteLocalPathForForcePull(
      ".obsidian/plugins/defcon-github-gitless-sync/data.json",
      ".obsidian",
      true,
      protectedPaths,
    ),
    false,
  );
  assert.equal(
    shouldDeleteLocalPathForForcePull(
      ".obsidian",
      ".obsidian",
      true,
      protectedPaths,
    ),
    false,
  );
  assert.equal(
    shouldDeleteLocalPathForForcePull(
      ".obsidian/workspace-mobile.json",
      ".obsidian",
      true,
      protectedPaths,
    ),
    false,
  );
});

test("automatic conflict policies choose the documented direction", () => {
  assert.equal(automaticConflictAction("overwriteLocal"), "download");
  assert.equal(automaticConflictAction("overwriteRemote"), "upload");
  assert.equal(automaticConflictAction("ask"), null);
});

test("a missing local file is restored instead of uploaded", () => {
  assert.equal(
    determineFileSyncAction(
      {
        path: "missed-delete.md",
        sha: "remote-sha",
        dirty: false,
        justDownloaded: false,
        lastModified: 100,
        deleted: false,
        deletedAt: null,
      },
      {
        path: "missed-delete.md",
        sha: "remote-sha",
        dirty: false,
        justDownloaded: false,
        lastModified: 100,
        deleted: false,
        deletedAt: null,
      },
      null,
    ),
    "download",
  );
});

test("an unchanged local file is deleted when the remote has a tombstone", () => {
  assert.equal(
    determineFileSyncAction(
      {
        path: "deleted.md",
        sha: "same-sha",
        dirty: true,
        justDownloaded: false,
        lastModified: 100,
        deleted: true,
        deletedAt: 200,
      },
      {
        path: "deleted.md",
        sha: "same-sha",
        dirty: false,
        justDownloaded: false,
        // A newer timestamp must not resurrect identical content.
        lastModified: 300,
        deleted: false,
        deletedAt: null,
      },
      "same-sha",
    ),
    "delete_local",
  );
});

test("a genuinely newer local edit can supersede a remote deletion", () => {
  assert.equal(
    determineFileSyncAction(
      {
        path: "edited.md",
        sha: "old-sha",
        dirty: true,
        justDownloaded: false,
        lastModified: 100,
        deleted: true,
        deletedAt: 200,
      },
      {
        path: "edited.md",
        sha: "old-sha",
        dirty: true,
        justDownloaded: false,
        lastModified: 300,
        deleted: false,
        deletedAt: null,
      },
      "new-sha",
    ),
    "upload",
  );
});

test("an unchanged remote file is deleted when the local has a tombstone", () => {
  assert.equal(
    determineFileSyncAction(
      {
        path: "deleted.md",
        sha: "same-sha",
        dirty: false,
        justDownloaded: false,
        // Clock skew must not resurrect identical remote content.
        lastModified: 300,
        deleted: false,
        deletedAt: null,
      },
      {
        path: "deleted.md",
        sha: "same-sha",
        dirty: true,
        justDownloaded: false,
        lastModified: 100,
        deleted: true,
        deletedAt: 200,
      },
      null,
    ),
    "delete_remote",
  );
});

test("a genuinely newer remote edit can supersede a local deletion", () => {
  assert.equal(
    determineFileSyncAction(
      {
        path: "edited.md",
        sha: "new-sha",
        dirty: false,
        justDownloaded: false,
        lastModified: 300,
        deleted: false,
        deletedAt: null,
      },
      {
        path: "edited.md",
        sha: "old-sha",
        dirty: true,
        justDownloaded: false,
        lastModified: 100,
        deleted: true,
        deletedAt: 200,
      },
      null,
    ),
    "download",
  );
});

test("ordinary paths are safe to write on Android", () => {
  assert.equal(hasAndroidUnsafePathSegment("Projects/Alpha/Notes.md"), false);
  assert.equal(hasAndroidUnsafePathSegment("a file with spaces.md"), false);
  assert.equal(hasAndroidUnsafePathSegment("emoji-📓.md"), false);
});

test("reserved characters make a path unsafe on Android", () => {
  for (const name of [
    "C* Garbage collection.md",
    "ratio 3:4.md",
    'quote".md',
    "why?.md",
    "a<b.md",
    "a>b.md",
    "a|b.md",
    "back\\slash.md",
  ]) {
    assert.equal(
      hasAndroidUnsafePathSegment(name),
      true,
      `expected "${name}" to be unsafe`,
    );
  }
});

test("an unsafe segment anywhere in the path is detected", () => {
  assert.equal(
    hasAndroidUnsafePathSegment("Notes/Meeting: Monday/agenda.md"),
    true,
  );
});

test("a trailing dot or space on a segment is unsafe on Android", () => {
  assert.equal(hasAndroidUnsafePathSegment("folder/draft.md "), true);
  assert.equal(hasAndroidUnsafePathSegment("folder./note.md"), true);
});

test("control characters make a path unsafe on Android", () => {
  assert.equal(hasAndroidUnsafePathSegment("bad\u0007name.md"), true);
});
