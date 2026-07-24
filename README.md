# GitHub Gitless Sync

Plugin to sync a GitHub repository with an Obsidian vault.

This repository is an independently maintained fork of
[`silvanocerza/github-gitless-sync`](https://github.com/silvanocerza/github-gitless-sync).
It uses a distinct Obsidian plugin ID so it can be installed and released
without replacing the upstream community plugin.

I highly recommend not using this plugin with another sync service.
This might create problems for this plugin when determining what needs to be synced between remote repository and local vault.

## Features

These are the main features of the plugin:

- Desktop and mobile support
- Doesn't require `git`
- Multiple vaults sync
- Automatic sync on fixed interval
- Manual sync
- Conflict resolution view

- Filtering by file type (TODO 🔨)

## Installation

This fork is not published in Obsidian's community plugin directory.
Install a release with [BRAT](https://github.com/TfTHacker/obsidian42-brat)
using `DefCon-007/obsidian-github-gitless-sync`, or copy `main.js`,
`manifest.json`, and `styles.css` from a release into:

```text
<vault>/.obsidian/plugins/defcon-github-gitless-sync/
```

### Build a local release

Use Node.js 24 and pnpm, then create an installable plugin directory:

```sh
nvm use
pnpm install --frozen-lockfile
pnpm release
```

The command recreates `dist/defcon-github-gitless-sync/` with only
`main.js`, `manifest.json`, and `styles.css`. Copy that entire directory into
your vault's `.obsidian/plugins/` directory, then reload Obsidian and enable
the plugin.

### Automated GitHub releases

Every push to `main` validates the project, builds the installable plugin, and
creates a GitHub tag and release using the version in `manifest.json`. The
release contains the three assets BRAT requires: `main.js`, `manifest.json`,
and `styles.css`.

Every change must increment the minor version before it reaches `main`:

```sh
pnpm bump:minor
```

The release workflow fails instead of replacing an existing release when a
version has already been published. Do not create or push release tags
manually.

### Issues

If you find any problem please open an issue with as many details as possible.

Please also provide logs if possible. Logging is enabled by default, and the
settings page can display a formatted log or copy its raw content for a bug
report. Log entries are displayed newest first. The log file is automatically
trimmed when it exceeds 1 MiB, retaining roughly the newest 768 KiB.

![Enable logging](./assets/logs_settings.png)

## Usage

### First sync

> [!IMPORTANT]
> The first sync requires either the remote repository or the local vault to be
> completely **EMPTY**. If both contain files, the plugin stops to prevent data
> loss. Use an empty repository to upload this vault, or use an empty vault to
> download the repository.

You must also configure the plugin settings before syncing.

These settings are mandatory:

- Your GitHub Token (see below)
- Repository owner
- Repository name
- Repository branch

If any of this is not set sync won't start.

### Token

A GitHub Fine-grained token is required to sync with your repository. You can create one by clicking [here](https://github.com/settings/personal-access-tokens/new).
The token must have the `Contents` permission set to `Read and write` like in the screenshot below.

![GitHub Fine-grained token](./assets/token_permissions.png)

I also suggest creating the token with access only to your sync repo.

### Sync modes

You can always sync manually by clicking the sync button in the side ribbon.
This will always work even if sync on interval is enabled.

Sync on startup is enabled by default and runs once the repository settings
have been configured.

![Sync button](./assets/sync_button.png)

If you don't want to see the button you can hide it, just check the plugin settings.

The `Sync with GitHub` command is also available.

### Conflict resolution

When you sync multiple vaults using this plugin you might risk creating conflicts between the remote and a local vault.
This usually happens when the remote has a new update from vault A, but vault B edits the file before syncing with remote.
That creates a conflict, by default we'll open a view to let you resolve the conflict since you should have all the necessary
information to correctly resolve it.

By default the split view will be used on desktop and the unified one on mobile, you can change the settings to always use the one you prefer.

![Split conflict resolution](./assets/split_diff_view.png)
![Unified conflict resolution](./assets/unified_diff_view.png)

If you don't want to resolve them you can change the settings to always prefer either the remote or local version in case of conflicts.

### Config sync

If you want to sync your vault configs with other vault you can enable that.
It will sync the whole folder, that is `.obsidian` by default, including all plugins and themes.

Note that the `.obsidian` folder will always be present, this happens because the plugin
needs to store some metadata to correctly sync

> [!CAUTION]
> DO NOT sync configs if your remote repository is public.
> That will expose the token you used to sync.

### Reset

If you need to reset the plugin settings and metadata you can easily do that in the settings.

That will completely wipe all the sync metadata so you'll have to repeat the first sync as if you just enabled the plugin for the first time.

## FAQs

### What's different from other sync plugins?

There are obviously other plugins that let you sync your vault with GitHub or other git hosts, like [`obsidian-git`](https://github.com/Vinzent03/obsidian-git) and [`Obsidian-GitHub-Sync`](https://github.com/kevinmkchin/Obsidian-GitHub-Sync) just to name a couple.

Most of those plugins though require the `git` executable to be present in your system, they might rely on Bash scripts too. This makes them much less portable, it's harder to use on Windows, and mobile is really unstable because most of the times they rely on [`isomorphic-git`](https://isomorphic-git.org/).

This annoyed me because I wanted to have the same experience on every platform, and I wanted especially to support mobile.

So I went a different way and chose to sync **only** with GitHub using their REST APIs, this means I don't rely in anyway on `git` being present in your system. This way I can easily support desktop and mobile with the same identical logic, and some small necessary differences in the UI for a better user experience.

This obviously comes with some limitations. Since `git` is not used you can't interact with your repository locally in any way, and any `git` feature like branching, merging, or rebasing, are not available at all.

Also since this relies only on the GitHub APIs you can only sync with GitHub and no other host.

### Can I use this with other sync plugins?

No.

To work correctly this plugin uses a custom metadata file that is updated every time we sync, if you commit changes outside the plugin that file is not updated properly.

Other plugins don't know about that file, so if you sync with others too you risk losing data.

## Contributing

Contributions are obviously accepted.

Bug fixes are always welcome. Please open an
[issue](https://github.com/DefCon-007/obsidian-github-gitless-sync/issues)
before starting a substantial feature.

Keep PRs as small as possible, I won't review PRs with hundreds of lines if it's mostly code.

Low quality or vibe coded PRs are not welcome. Put some effort in it please.

## License

The project is licensed under the [AGPLv3](https://www.gnu.org/licenses/agpl-3.0.en.html) license.
