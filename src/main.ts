import {
  EventRef,
  IconName,
  Plugin,
  WorkspaceLeaf,
  Notice,
  normalizePath,
  setIcon,
} from "obsidian";
import { GitHubSyncSettings, DEFAULT_SETTINGS } from "./settings/settings";
import GitHubSyncSettingsTab from "./settings/tab";
import SyncManager, { ConflictFile, ConflictResolution } from "./sync-manager";
import Logger from "./logger";
import {
  ConflictsResolutionView,
  CONFLICTS_RESOLUTION_VIEW_TYPE,
} from "./views/conflicts-resolution/view";
import LogViewerModal from "./log-viewer";
import { LOG_FILE_NAME, MANIFEST_FILE_NAME } from "./constants";
import { needsFirstSync } from "./sync-rules";
import {
  SyncState,
  syncPresentation,
} from "./sync-status";

export default class GitHubSyncPlugin extends Plugin {
  declare settings: GitHubSyncSettings;
  syncManager!: SyncManager;
  logger!: Logger;
  settingsTab!: GitHubSyncSettingsTab;

  statusBarItem: HTMLElement | null = null;
  syncRibbonIcon: HTMLElement | null = null;
  conflictsRibbonIcon: HTMLElement | null = null;

  activeLeafChangeListener: EventRef | null = null;
  vaultCreateListener: EventRef | null = null;
  vaultModifyListener: EventRef | null = null;

  // Called in ConflictResolutionView when the user solves all the conflicts.
  // This is initialized every time we open the view to set new conflicts so
  // we can notify the SyncManager that everything has been resolved and the sync
  // process can continue on.
  conflictsResolver: ((resolutions: ConflictResolution[]) => void) | null =
    null;

  // We keep track of the sync conflicts in here too in case the
  // conflicts view must be rebuilt, or the user closes the view
  // and it gets destroyed.
  // By keeping them here we can recreate it easily.
  private conflicts: ConflictFile[] = [];
  private syncInProgress = false;
  private syncState: SyncState = "idle";
  private syncStateResetTimer: number | null = null;

  async onUserEnable() {
    if (
      this.settings.githubToken === "" ||
      this.settings.githubOwner === "" ||
      this.settings.githubRepo === "" ||
      this.settings.githubBranch === ""
    ) {
      new Notice("Go to settings to configure syncing");
    }
  }

  getConflictsView(): ConflictsResolutionView | null {
    const leaves = this.app.workspace.getLeavesOfType(
      CONFLICTS_RESOLUTION_VIEW_TYPE,
    );
    if (leaves.length === 0) {
      return null;
    }
    return leaves[0].view as ConflictsResolutionView;
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(CONFLICTS_RESOLUTION_VIEW_TYPE);
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeaf(false)!;
      await leaf.setViewState({
        type: CONFLICTS_RESOLUTION_VIEW_TYPE,
        active: true,
      });
    }
    workspace.revealLeaf(leaf);
  }

  async onload() {
    await this.loadSettings();

    this.logger = new Logger(this.app.vault, this.settings.enableLogging);
    await this.logger.init();
    await this.markInterruptedSync();

    this.registerView(
      CONFLICTS_RESOLUTION_VIEW_TYPE,
      (leaf) => new ConflictsResolutionView(leaf, this, this.conflicts),
    );

    this.settingsTab = new GitHubSyncSettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);

    this.syncManager = new SyncManager(
      this.app.vault,
      this.settings,
      this.onConflicts.bind(this),
      this.logger,
    );
    await this.syncManager.loadMetadata();

    if (this.settings.syncStrategy == "interval") {
      this.restartSyncInterval();
    }

    this.app.workspace.onLayoutReady(async () => {
      // Create the events handling only after tha layout is ready to avoid
      // getting spammed with create events.
      // See the official Obsidian docs:
      // https://docs.obsidian.md/Reference/TypeScript+API/Vault/on('create')
      this.syncManager.startEventsListener(this);

      // Load the ribbons after layout is ready so they're shown after the core
      // buttons
      if (this.settings.showStatusBarItem) {
        this.showStatusBarItem();
      }

      if (this.settings.showConflictsRibbonButton) {
        this.showConflictsRibbonIcon();
      }

      if (this.settings.showSyncRibbonButton) {
        this.showSyncRibbonIcon();
      }

      if (this.settings.syncOnStartup && this.isConfigured()) {
        void this.sync();
      }
    });

    this.addCommand({
      id: "sync-files",
      name: "Sync with GitHub",
      repeatable: false,
      icon: "refresh-cw",
      callback: this.sync.bind(this),
    });

    this.addCommand({
      id: "merge",
      name: "Open sync conflicts view",
      repeatable: false,
      icon: "refresh-cw",
      callback: this.openConflictsView.bind(this),
    });
  }

  async sync() {
    return await this.runSync(false);
  }

  async forcePull() {
    return await this.runSync(true);
  }

  private async runSync(forcePull: boolean) {
    if (!this.isConfigured()) {
      new Notice("Sync plugin not configured");
      return false;
    }

    if (this.syncInProgress) {
      new Notice("A GitHub sync is already in progress", 3000);
      return false;
    }

    const notice = new Notice(
      forcePull ? "Force pulling from GitHub..." : "Syncing with GitHub...",
    );
    const startedAt = new Date().toISOString();
    const syncId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const wasFirstSync =
      !forcePull &&
      needsFirstSync(
        this.settings.firstSync,
        this.syncManager.getLastSyncTime(),
      );
    this.syncInProgress = true;
    this.setSyncState("syncing");
    this.logger.startSyncRun(syncId);
    this.settings.lastSync = {
      id: syncId,
      status: "syncing",
      startedAt,
      message: forcePull ? "Force pull in progress" : "Sync in progress",
    };
    await this.saveLastSyncReport();

    try {
      await this.logger.info(forcePull ? "Force pull started" : "Sync started");
      if (!forcePull && this.settings.firstSync && !wasFirstSync) {
        this.settings.firstSync = false;
        await this.saveSettings();
        await this.logger.info(
          "Recovered stale first-sync setting from local sync metadata",
        );
      }
      if (forcePull) {
        await this.syncManager.forcePull(this.forcePullProtectedPaths());
        this.settings.firstSync = false;
        await this.saveSettings();
      } else if (wasFirstSync) {
        await this.syncManager.firstSync();
        this.settings.firstSync = false;
        await this.saveSettings();
      } else {
        await this.syncManager.sync();
      }
      await this.logger.info(
        forcePull ? "Force pull succeeded" : "Sync succeeded",
      );
      this.settings.lastSync = {
        id: syncId,
        status: "success",
        startedAt,
        completedAt: new Date().toISOString(),
        message: forcePull
          ? "Force pull completed successfully"
          : wasFirstSync
            ? "First sync completed successfully"
            : "Sync completed successfully",
      };
      await this.saveLastSyncReport();
      this.setSyncState("success");
      new Notice(forcePull ? "Force pull successful" : "Sync successful", 5000);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setSyncState("error");
      new Notice(`Error syncing. ${message}`);
      try {
        await this.logger.error("Sync failed", {
          error: message,
          stack: error instanceof Error ? error.stack : undefined,
        });
      } catch {
        // Logging must never hide the sync failure from the user.
      }
      this.settings.lastSync = {
        id: syncId,
        status: "error",
        startedAt,
        completedAt: new Date().toISOString(),
        message,
      };
      await this.saveLastSyncReport();
      return false;
    } finally {
      this.logger.endSyncRun();
      this.syncInProgress = false;
      notice.hide();
    }
  }

  private forcePullProtectedPaths(): string[] {
    const configDir = this.app.vault.configDir;
    return [
      normalizePath(`${configDir}/plugins/${this.manifest.id}`),
      normalizePath(`${configDir}/${MANIFEST_FILE_NAME}`),
      normalizePath(`${configDir}/${LOG_FILE_NAME}`),
    ];
  }

  async onunload() {
    this.stopSyncInterval();
  }

  showStatusBarItem() {
    if (this.statusBarItem) {
      return;
    }
    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBarItem();

    if (!this.activeLeafChangeListener) {
      this.activeLeafChangeListener = this.app.workspace.on(
        "active-leaf-change",
        () => this.updateStatusBarItem(),
      );
    }
    if (!this.vaultCreateListener) {
      this.vaultCreateListener = this.app.vault.on("create", () => {
        this.updateStatusBarItem();
      });
    }
    if (!this.vaultModifyListener) {
      this.vaultModifyListener = this.app.vault.on("modify", () => {
        this.updateStatusBarItem();
      });
    }
  }

  hideStatusBarItem() {
    this.statusBarItem?.remove();
    this.statusBarItem = null;
  }

  updateStatusBarItem() {
    if (!this.statusBarItem) {
      return;
    }
    const presentation = syncPresentation(this.syncState);
    if (presentation.statusText !== null) {
      this.statusBarItem.setText(presentation.statusText);
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      this.statusBarItem.setText("GitHub: Ready");
      return;
    }

    let state = "Unknown";
    const fileData = this.syncManager.getFileMetadata(activeFile.path);
    if (!fileData) {
      state = "Untracked";
    } else if (fileData.dirty) {
      state = "Outdated";
    } else if (!fileData.dirty) {
      state = "Up to date";
    }

    this.statusBarItem.setText(`GitHub: ${state}`);
  }

  showSyncRibbonIcon() {
    if (this.syncRibbonIcon) {
      return;
    }
    this.syncRibbonIcon = this.addRibbonIcon(
      "refresh-cw",
      "Sync with GitHub",
      this.sync.bind(this),
    );
    this.renderSyncState();
  }

  hideSyncRibbonIcon() {
    this.syncRibbonIcon?.remove();
    this.syncRibbonIcon = null;
  }

  private setSyncState(state: SyncState) {
    if (this.syncStateResetTimer !== null) {
      window.clearTimeout(this.syncStateResetTimer);
      this.syncStateResetTimer = null;
    }

    this.syncState = state;
    this.renderSyncState();
    this.updateStatusBarItem();

    if (state === "success" || state === "error") {
      this.syncStateResetTimer = window.setTimeout(() => {
        this.syncStateResetTimer = null;
        this.setSyncState("idle");
      }, 5000);
      this.registerInterval(this.syncStateResetTimer);
    }
  }

  private renderSyncState() {
    if (!this.syncRibbonIcon) {
      return;
    }

    const presentation = syncPresentation(this.syncState);
    setIcon(this.syncRibbonIcon, presentation.icon as IconName);
    this.syncRibbonIcon.setAttribute("aria-label", presentation.tooltip);
    this.syncRibbonIcon.setAttribute("data-tooltip-position", "right");
    this.syncRibbonIcon.toggleClass(
      "github-sync-ribbon-is-syncing",
      this.syncState === "syncing",
    );
    this.syncRibbonIcon.setAttribute(
      "aria-disabled",
      this.syncState === "syncing" ? "true" : "false",
    );
  }

  async openLogs(): Promise<"viewer"> {
    await this.logger.init();
    const logs = await this.logger.read();
    new LogViewerModal(this.app, logs).open();
    return "viewer";
  }

  showConflictsRibbonIcon() {
    if (this.conflictsRibbonIcon) {
      return;
    }
    this.conflictsRibbonIcon = this.addRibbonIcon(
      "merge",
      "Open sync conflicts view",
      this.openConflictsView.bind(this),
    );
  }

  hideConflictsRibbonIcon() {
    this.conflictsRibbonIcon?.remove();
    this.conflictsRibbonIcon = null;
  }

  async openConflictsView() {
    await this.activateView();
    this.getConflictsView()?.setConflictFiles(this.conflicts);
  }

  async onConflicts(conflicts: ConflictFile[]): Promise<ConflictResolution[]> {
    this.conflicts = conflicts;
    return await new Promise((resolve, reject) => {
      this.conflictsResolver = resolve;
      this.activateView()
        .then(() => this.getConflictsView()?.setConflictFiles(conflicts))
        .catch(reject);
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private isConfigured(): boolean {
    return (
      this.settings.githubToken !== "" &&
      this.settings.githubOwner !== "" &&
      this.settings.githubRepo !== "" &&
      this.settings.githubBranch !== ""
    );
  }

  private async saveLastSyncReport(): Promise<void> {
    try {
      await this.saveSettings();
    } catch (error) {
      try {
        await this.logger.warn("Failed to save last sync status", {
          error: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // Status reporting must never interrupt a sync.
      }
    } finally {
      this.settingsTab.refreshSyncActivity();
    }
  }

  private async markInterruptedSync(): Promise<void> {
    const report = this.settings.lastSync;
    if (report?.status !== "syncing") {
      return;
    }

    this.logger.startSyncRun(report.id);
    try {
      await this.logger.error("Sync was interrupted before completion");
    } catch {
      // A logging failure should not prevent the plugin from loading.
    } finally {
      this.logger.endSyncRun();
    }

    this.settings.lastSync = {
      ...report,
      status: "error",
      completedAt: new Date().toISOString(),
      message: "Sync was interrupted before completion",
    };
    await this.saveSettings();
  }

  // Proxy methods from sync manager to ease handling the interval
  // when settings are changed
  startSyncInterval() {
    const intervalID = this.syncManager.startSyncInterval(
      this.settings.syncInterval,
      async () => {
        await this.sync();
      },
    );
    this.registerInterval(intervalID);
  }

  stopSyncInterval() {
    this.syncManager.stopSyncInterval();
  }

  restartSyncInterval() {
    this.syncManager.stopSyncInterval();
    this.startSyncInterval();
  }

  async reset() {
    Object.assign(this.settings, DEFAULT_SETTINGS);
    this.logger.enable();
    await this.saveSettings();
    await this.syncManager.resetMetadata();
    this.settingsTab.refreshSyncActivity();
  }
}
