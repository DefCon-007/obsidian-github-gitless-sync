# Repository instructions

- Do not manually bump versions for feature or fix commits. Release CI
  increments the minor version and commits the synchronized `package.json`,
  `manifest.json`, `manifest-beta.json`, and `versions.json` changes.
- Run the build, tests, lint, and release packaging before committing.
- Do not create release tags manually. A successful push to `main`
  automatically bumps the version and creates the matching GitHub tag and
  BRAT-compatible release.
