import { strict as assert } from "node:assert";
import test from "node:test";
import { syncPresentation } from "../src/sync-status";

test("sync state presentations provide distinct visual feedback", () => {
  assert.deepEqual(syncPresentation("idle"), {
    icon: "refresh-cw",
    tooltip: "Sync with GitHub",
    statusText: null,
  });
  assert.equal(syncPresentation("syncing").icon, "loader-circle");
  assert.equal(syncPresentation("success").statusText, "GitHub: Synced");
  assert.equal(syncPresentation("error").statusText, "GitHub: Sync failed");
});
