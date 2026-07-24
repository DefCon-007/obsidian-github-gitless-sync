import {
  EventRef,
  FileSystemAdapter,
  IconName,
  Plugin,
  Platform,
  WorkspaceLeaf,
  Notice,
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
import {
  SyncState,
  syncPresentation,
} from "./sync-status";

export default class GitHubSyncPlugin extends Plugin {
  declare settings: GitHubSyncSettings;
  syncManager!: SyncManager;
  logger!: Logger;

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

    this.registerView(
      CONFLICTS_RESOLUTION_VIEW_TYPE,
      (leaf) => new ConflictsResolutionView(leaf, this, this.conflicts),
    );

    this.addSettingTab(new GitHubSyncSettingsTab(this.app, this));

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
    if (
      this.settings.githubToken === "" ||
      this.settings.githubOwner === "" ||
      this.settings.githubRepo === "" ||
      this.settings.githubBranch === ""
    ) {
      new Notice("Sync plugin not configured");
      return;
    }

    if (this.syncInProgress) {
      new Notice("A GitHub sync is already in progress", 3000);
      return;
    }

    const notice = new Notice("Syncing with GitHub...");
    this.syncInProgress = true;
    this.setSyncState("syncing");
    try {
      if (this.settings.firstSync) {
        await this.syncManager.firstSync();
        this.settings.firstSync = false;
        await this.saveSettings();
      } else {
        await this.syncManager.sync();
      }
      this.setSyncState("success");
      new Notice("Sync successful", 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setSyncState("error");
      new Notice(`Error syncing. ${message}`);
      try {
        await this.logger.error("Sync failed", { error: message });
      } catch {
        // Logging must never hide the sync failure from the user.
      }
    } finally {
      this.syncInProgress = false;
      notice.hide();
    }
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

  async openLogs(): Promise<"default-app" | "viewer"> {
    await this.logger.init();

    if (
      Platform.isDesktopApp &&
      this.app.vault.adapter instanceof FileSystemAdapter
    ) {
      try {
        const { shell } = await import("electron");
        const fullPath = this.app.vault.adapter.getFullPath(
          this.logger.getFilePath(),
        );
        const error = await shell.openPath(fullPath);
        if (error !== "") {
          throw new Error(error);
        }
        return "default-app";
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.logger.warn("Failed to open logs in default app", {
          error: message,
        });
      }
    }

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

  // Proxy methods from sync manager to ease handling the interval
  // when settings are changed
  startSyncInterval() {
    const intervalID = this.syncManager.startSyncInterval(
      this.settings.syncInterval,
      this.sync.bind(this),
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
    this.settings = DEFAULT_SETTINGS;
    this.saveSettings();
    await this.syncManager.resetMetadata();
  }
}
