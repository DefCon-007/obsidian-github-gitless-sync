# Repository instructions

- Increment the plugin's minor version for every new change.
- Keep `package.json`, `manifest.json`, `manifest-beta.json`, and
  `versions.json` synchronized when bumping the version.
- Run the build, tests, lint, and release packaging before committing.
- Do not create release tags manually. A successful push to `main`
  automatically creates the matching GitHub tag and BRAT-compatible release.
