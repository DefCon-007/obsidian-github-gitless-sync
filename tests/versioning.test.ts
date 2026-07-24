import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

test("plugin version files stay synchronized", () => {
  const packageJson = readJson("package.json");
  const manifest = readJson("manifest.json");
  const betaManifest = readJson("manifest-beta.json");
  const versions = readJson("versions.json");
  const version = packageJson.version;

  assert.equal(manifest.version, version);
  assert.equal(betaManifest.version, `${String(version)}-beta`);
  assert.equal(versions[String(version)], manifest.minAppVersion);
});
