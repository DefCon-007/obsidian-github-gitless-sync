import { strict as assert } from "node:assert";
import test from "node:test";
import {
  entriesForSync,
  formatLogData,
  parseLogEntries,
} from "../src/log-entry";
import { DEFAULT_SETTINGS } from "../src/settings/settings";

test("structured and legacy log lines are parsed for display", () => {
  const entries = parseLogEntries(
    [
      JSON.stringify({
        timestamp: "2026-07-24T12:00:00.000Z",
        level: "info",
        message: "Sync started",
        additional_data: { files: 2 },
        sync_id: "sync-1",
      }),
      "Legacy plain-text log entry",
      "",
    ].join("\n"),
  );

  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    timestamp: "2026-07-24T12:00:00.000Z",
    level: "INFO",
    message: "Sync started",
    additionalData: { files: 2 },
    syncId: "sync-1",
    raw: false,
  });
  assert.equal(entries[1].message, "Legacy plain-text log entry");
  assert.equal(entries[1].raw, true);
});

test("sync logs can be selected by run id", () => {
  const entries = parseLogEntries(
    [
      '{"level":"INFO","message":"First","sync_id":"sync-1"}',
      '{"level":"ERROR","message":"Second","sync_id":"sync-2"}',
      '{"level":"INFO","message":"Third","sync_id":"sync-1"}',
    ].join("\n"),
  );

  assert.deepEqual(
    entriesForSync(entries, "sync-1").map((entry) => entry.message),
    ["First", "Third"],
  );
});

test("additional log data is formatted as readable JSON", () => {
  assert.equal(
    formatLogData({ action: "upload", files: ["one.md", "two.md"] }),
    [
      "{",
      '  "action": "upload",',
      '  "files": [',
      '    "one.md",',
      '    "two.md"',
      "  ]",
      "}",
    ].join("\n"),
  );
});

test("logging and startup sync are enabled for new installations", () => {
  assert.equal(DEFAULT_SETTINGS.enableLogging, true);
  assert.equal(DEFAULT_SETTINGS.syncOnStartup, true);
});
