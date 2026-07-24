import { readFileSync, writeFileSync } from "fs";

const packageJsonPath = "package.json";
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
let targetVersion = process.env.npm_package_version;

if (process.argv[2] === "minor") {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageJson.version);
  if (!match) {
    throw new Error(`Unsupported package version: ${packageJson.version}`);
  }

  targetVersion = `${match[1]}.${Number(match[2]) + 1}.0`;
  packageJson.version = targetVersion;
  writeFileSync(
    packageJsonPath,
    JSON.stringify(packageJson, null, "  ") + "\n",
  );
}

if (!targetVersion) {
  throw new Error("npm_package_version is required to bump plugin manifests");
}

// Read minAppVersion from manifest.json and bump version to target version.
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "  "));

// Keep the beta manifest aligned with the stable plugin version.
let betaManifest = JSON.parse(readFileSync("manifest-beta.json", "utf8"));
betaManifest.version = `${targetVersion}-beta`;
writeFileSync(
  "manifest-beta.json",
  JSON.stringify(betaManifest, null, "  "),
);

// Update versions.json with target version and minAppVersion from manifest.json.
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "  "));
