import { Vault, TAbstractFile, TFolder } from "obsidian";
import MetadataStore from "./metadata-store";
import { GitHubSyncSettings } from "./settings/settings";
import Logger from "./logger";
import GitHubSyncPlugin from "./main";
import { isSyncablePath } from "./sync-rules";

/**
 * Tracks changes to local sync directory and updates files metadata.
 */
export default class EventsListener {
  private paused = false;

  constructor(
    private vault: Vault,
    private metadataStore: MetadataStore,
    private settings: GitHubSyncSettings,
    private logger: Logger,
  ) {}

  start(plugin: GitHubSyncPlugin) {
    // We need to register all the events we subscribe to so they can
    // be correctly detached when the plugin is unloaded too.
    // If we don't they might be left hanging and cause issues.
    plugin.registerEvent(this.vault.on("create", this.onCreate.bind(this)));
    plugin.registerEvent(this.vault.on("delete", this.onDelete.bind(this)));
    plugin.registerEvent(this.vault.on("modify", this.onModify.bind(this)));
    plugin.registerEvent(this.vault.on("rename", this.onRename.bind(this)));
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  private async onCreate(file: TAbstractFile) {
    if (this.paused) return;
    await this.logger.info("Received create event", file.path);
    if (!this.isSyncable(file.path)) {
      // The file has not been created in directory that we're syncing with GitHub
      await this.logger.info("Skipped created file", file.path);
      return;
    }
    if (file instanceof TFolder) {
      // Skip folders
      return;
    }

    const data = this.metadataStore.data.files[file.path];
    if (data && data.justDownloaded) {
      // This file was just downloaded and not created by the user.
      // It's enough to mark it as non just downloaded.
      this.metadataStore.data.files[file.path].justDownloaded = false;
      await this.metadataStore.save();
      await this.logger.info("Updated just downloaded created file", file.path);
      return;
    }

    this.metadataStore.data.files[file.path] = {
      path: file.path,
      sha: null,
      dirty: true,
      // This file has been created by the user
      justDownloaded: false,
      lastModified: Date.now(),
    };
    await this.metadataStore.save();
    await this.logger.info("Updated created file", file.path);
  }

  private async onDelete(file: TAbstractFile | string) {
    if (this.paused) return;
    const filePath = file instanceof TAbstractFile ? file.path : file;
    await this.logger.info("Received delete event", filePath);
    if (file instanceof TFolder) {
      // Skip folders
      return;
    }
    if (!this.isSyncable(filePath)) {
      // The file was not in directory that we're syncing with GitHub
      return;
    }

    const deletedAt = Date.now();
    const existing = this.metadataStore.data.files[filePath];
    this.metadataStore.data.files[filePath] = {
      path: filePath,
      sha: existing?.sha ?? null,
      dirty: true,
      justDownloaded: false,
      lastModified: existing?.lastModified ?? 0,
      deleted: true,
      deletedAt,
    };
    await this.metadataStore.save();
    await this.logger.info("Updated deleted file", filePath);
  }

  private async onModify(file: TAbstractFile) {
    if (this.paused) return;
    await this.logger.info("Received modify event", file.path);
    if (!this.isSyncable(file.path)) {
      // The file has not been create in directory that we're syncing with GitHub
      await this.logger.info("Skipped modified file", file.path);
      return;
    }
    if (file instanceof TFolder) {
      // Skip folders
      return;
    }
    const data = this.metadataStore.data.files[file.path];
    if (data && data.justDownloaded) {
      // This file was just downloaded and not modified by the user.
      // It's enough to makr it as non just downloaded.
      this.metadataStore.data.files[file.path].justDownloaded = false;
      await this.metadataStore.save();
      await this.logger.info(
        "Updated just downloaded modified file",
        file.path,
      );
      return;
    }
    const modifiedAt = Date.now();
    const existing = this.metadataStore.data.files[file.path];
    this.metadataStore.data.files[file.path] = {
      path: file.path,
      sha: existing?.sha ?? null,
      dirty: true,
      justDownloaded: false,
      lastModified: modifiedAt,
      deleted: false,
      deletedAt: null,
    };
    await this.metadataStore.save();
    await this.logger.info("Updated modified file", file.path);
  }

  private async onRename(file: TAbstractFile, oldPath: string) {
    if (this.paused) return;
    await this.logger.info("Received rename event", file.path);
    if (file instanceof TFolder) {
      // Skip folders
      return;
    }
    if (!this.isSyncable(file.path) && !this.isSyncable(oldPath)) {
      // Both are not in directory that we're syncing with GitHub
      return;
    }

    if (this.isSyncable(file.path) && this.isSyncable(oldPath)) {
      // Both files are in the synced directory
      // First create the new one
      await this.onCreate(file);
      // Then delete the old one
      await this.onDelete(oldPath);
      return;
    } else if (this.isSyncable(file.path)) {
      // Only the new file is in the local directory
      await this.onCreate(file);
      return;
    } else if (this.isSyncable(oldPath)) {
      // Only the old file was in the local directory
      await this.onDelete(oldPath);
      return;
    }
  }

  private isSyncable(filePath: string) {
    return isSyncablePath(
      filePath,
      this.vault.configDir,
      this.settings.syncConfigDir,
    );
  }
}
