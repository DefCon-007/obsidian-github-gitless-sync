import {
  PluginSettingTab,
  App,
  Setting,
  TextComponent,
  Modal,
  Notice,
} from "obsidian";
import GitHubSyncPlugin from "src/main";
import { copyToClipboard } from "src/utils";
import { entriesForSync } from "../log-entry";
import { renderLogEntries } from "../log-viewer";

export default class GitHubSyncSettingsTab extends PluginSettingTab {
  plugin: GitHubSyncPlugin;
  private syncActivityEl: HTMLElement | null = null;
  private syncActivityRenderVersion = 0;

  constructor(app: App, plugin: GitHubSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl).setName("Remote Repository").setHeading();

    let tokenInput: TextComponent;
    new Setting(containerEl)
      .setName("GitHub token")
      .setDesc(
        "A personal access token or a fine-grained token with read and write access to your repository",
      )
      .addButton((button) =>
        button.setIcon("eye-off").onClick((e) => {
          if (tokenInput.inputEl.type === "password") {
            tokenInput.inputEl.type = "text";
            button.setIcon("eye");
          } else {
            tokenInput.inputEl.type = "password";
            button.setIcon("eye-off");
          }
        }),
      )
      .addText((text) => {
        text
          .setPlaceholder("Token")
          .setValue(this.plugin.settings.githubToken)
          .onChange(async (value) => {
            this.plugin.settings.githubToken = value;
            await this.plugin.saveSettings();
          }).inputEl.type = "password";
        tokenInput = text;
      });

    new Setting(containerEl)
      .setName("Owner")
      .setDesc("Owner of the repository to sync")
      .addText((text) =>
        text
          .setPlaceholder("Owner")
          .setValue(this.plugin.settings.githubOwner)
          .onChange(async (value) => {
            this.plugin.settings.githubOwner = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Repository")
      .setDesc("Name of the repository to sync")
      .addText((text) =>
        text
          .setPlaceholder("Repository")
          .setValue(this.plugin.settings.githubRepo)
          .onChange(async (value) => {
            this.plugin.settings.githubRepo = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Repository branch")
      .setDesc("Branch to sync")
      .addText((text) =>
        text
          .setPlaceholder("Branch name")
          .setValue(this.plugin.settings.githubBranch)
          .onChange(async (value) => {
            this.plugin.settings.githubBranch = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("Sync").setHeading();

    this.syncActivityEl = containerEl.createDiv(
      "github-sync-settings-activity",
    );
    void this.renderSyncActivity(this.syncActivityEl);

    const syncStrategies = {
      manual: "Manually",
      interval: "On Interval",
    };
    const uploadStrategySetting = new Setting(containerEl)
      .setName("Sync strategy")
      .setDesc("How to sync files with remote repository");

    let syncInterval = "1";
    if (this.plugin.settings.syncInterval) {
      syncInterval = this.plugin.settings.syncInterval.toString();
    }
    const intervalSettings = new Setting(containerEl)
      .setName("Sync interval")
      .setDesc("Interval in minutes between automatic syncs")
      .addText((text) =>
        text
          .setPlaceholder("Interval in minutes")
          .setValue(syncInterval)
          .onChange(async (value) => {
            this.plugin.settings.syncInterval = parseInt(value) || 1;
            await this.plugin.saveSettings();
            // We need to restart the interval if the value is changed
            this.plugin.restartSyncInterval();
          }),
      );
    intervalSettings.setDisabled(
      this.plugin.settings.syncStrategy !== "interval",
    );

    uploadStrategySetting.addDropdown((dropdown) =>
      dropdown
        .addOptions(syncStrategies)
        .setValue(this.plugin.settings.syncStrategy)
        .onChange(async (value) => {
          const strategy = value as keyof typeof syncStrategies;
          intervalSettings.setDisabled(strategy !== "interval");
          this.plugin.settings.syncStrategy = strategy;
          await this.plugin.saveSettings();
          if (strategy === "interval") {
            this.plugin.startSyncInterval();
          } else {
            this.plugin.stopSyncInterval();
          }
        }),
    );

    new Setting(containerEl)
      .setName("Sync on startup")
      .setDesc("Download up to date files from remote on startup")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.syncOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.syncOnStartup = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Sync configs")
      .setDesc("Sync Vault config folder with remote repository")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.syncConfigDir)
          .onChange(async (value) => {
            this.plugin.settings.syncConfigDir = value;
            if (value) {
              await this.plugin.syncManager.addConfigDirToMetadata();
            } else {
              await this.plugin.syncManager.removeConfigDirFromMetadata();
            }
            await this.plugin.saveSettings();
          });
      });

    const conflictHandlingOptions = {
      overwriteLocal: "Overwrite local file",
      ask: "Ask",
      overwriteRemote: "Overwrite remote file",
    };
    new Setting(containerEl)
      .setName("Conflict handling")
      .setDesc(
        `What to do in case remote and local files conflict
        when downloading from GitHub repository`,
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOptions(conflictHandlingOptions)
          .setValue(this.plugin.settings.conflictHandling)
          .onChange(async (value) => {
            this.plugin.settings.conflictHandling =
              value as keyof typeof conflictHandlingOptions;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setName("Interface").setHeading();

    new Setting(containerEl)
      .setName("Show status bar item")
      .setDesc("Displays the status bar item that show the file sync status")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showStatusBarItem)
          .onChange((value) => {
            this.plugin.settings.showStatusBarItem = value;
            this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Show sync button")
      .setDesc("Displays a ribbon button to sync files")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showSyncRibbonButton)
          .onChange((value) => {
            this.plugin.settings.showSyncRibbonButton = value;
            this.plugin.saveSettings();
            if (value) {
              this.plugin.showSyncRibbonIcon();
            } else {
              this.plugin.hideSyncRibbonIcon();
            }
          });
      });

    new Setting(containerEl)
      .setName("Show conflicts view button")
      .setDesc("Displays a ribbon button that opens the conflicts view")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showConflictsRibbonButton)
          .onChange((value) => {
            this.plugin.settings.showConflictsRibbonButton = value;
            this.plugin.saveSettings();
            if (value) {
              this.plugin.showConflictsRibbonIcon();
            } else {
              this.plugin.hideConflictsRibbonIcon();
            }
          });
      });

    const diffModeOptions = {
      default: "Default",
      unified: "Unified",
      split: "Split",
    };
    new Setting(containerEl)
      .setName("Conflict resolution view mode")
      .setDesc("Set which diff view mode should be shown in case of conflicts")
      .addDropdown((dropdown) => {
        dropdown
          .addOptions(diffModeOptions)
          .setValue(this.plugin.settings.conflictViewMode)
          .onChange(async (value) => {
            this.plugin.settings.conflictViewMode =
              value as keyof typeof diffModeOptions;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setName("Extra").setHeading();

    new Setting(containerEl)
      .setName("Enable logging")
      .setDesc(
        "If enabled logs from this plugin will be saved in a file in your config directory.",
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.enableLogging)
          .onChange((value) => {
            this.plugin.settings.enableLogging = value;
            if (value) {
              this.plugin.logger.enable();
            } else {
              this.plugin.logger.disable();
            }
            this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Open logs")
      .setDesc(
        "Open the complete sync log in a formatted, readable viewer.",
      )
      .addButton((button) => {
        button
          .setButtonText("Open")
          .setIcon("file-text")
          .onClick(async () => {
            try {
              await this.plugin.openLogs();
            } catch (error) {
              new Notice(`Failed opening logs: ${error}`, 10000);
            }
          });
      });

    new Setting(containerEl)
      .setName("Copy logs")
      .setDesc("Copy the log file content, this is useful to report bugs.")
      .addButton((button) => {
        button.setButtonText("Copy").onClick(async () => {
          const logs: string = await this.plugin.logger.read();
          try {
            await copyToClipboard(logs);
            new Notice("Logs copied", 5000);
          } catch (err) {
            new Notice(`Failed copying logs: ${err}`, 10000);
          }
        });
      });

    new Setting(containerEl)
      .setName("Clean logs")
      .setDesc("Delete all existing logs.")
      .addButton((button) => {
        button.setButtonText("Clean").onClick(async () => {
          await this.plugin.logger.clean();
          this.refreshSyncActivity();
        });
      });

    new Setting(containerEl)
      .setName("Reset")
      .setDesc("Reset the plugin settings and metadata")
      .addButton((button) => {
        button
          .setButtonText("RESET")
          .setCta()
          .onClick(() => {
            const modal = new Modal(this.plugin.app);
            modal.setTitle("Are you sure?");
            modal.setContent(
              "This will completely delete all sync metadata and plugin settings.\n" +
                "You'll have to repeat the first sync if you want to use the plugin again.",
            );
            new Setting(modal.contentEl);
            new Setting(modal.contentEl)
              .addButton((btn) =>
                btn
                  .setButtonText("Reset")
                  .setCta()
                  .onClick(async () => {
                    await this.plugin.reset();
                    modal.close();
                  }),
              )
              .addButton((btn) =>
                btn.setButtonText("Cancel").onClick(() => {
                  modal.close();
                }),
              );
            modal.open();
          });
      });
  }

  refreshSyncActivity(): void {
    if (this.syncActivityEl?.isConnected) {
      void this.renderSyncActivity(this.syncActivityEl);
    }
  }

  private async renderSyncActivity(containerEl: HTMLElement): Promise<void> {
    const renderVersion = ++this.syncActivityRenderVersion;
    containerEl.empty();
    containerEl.createEl("h4", { text: "Last sync" });

    const report = this.plugin.settings.lastSync;
    if (report === null) {
      containerEl.createDiv({
        cls: "github-sync-last-sync-empty",
        text: "No sync has run yet.",
      });
      return;
    }

    const summaryEl = containerEl.createDiv("github-sync-last-sync-summary");
    summaryEl.createSpan({
      cls: `github-sync-last-sync-badge is-${report.status}`,
      text: getSyncStatusLabel(report.status),
    });
    summaryEl.createSpan({
      cls: "github-sync-last-sync-time",
      text: formatSyncTime(report.completedAt ?? report.startedAt),
    });
    containerEl.createDiv({
      cls: "github-sync-last-sync-message",
      text: report.message,
    });

    const logHeadingEl = containerEl.createDiv(
      "github-sync-last-sync-log-heading",
    );
    logHeadingEl.setText("Logs for this sync");
    const loadingEl = containerEl.createDiv({
      cls: "github-sync-log-empty",
      text: "Loading sync logs…",
    });

    try {
      const entries = entriesForSync(
        await this.plugin.logger.readEntries(),
        report.id,
      );
      if (
        this.syncActivityEl !== containerEl ||
        renderVersion !== this.syncActivityRenderVersion
      ) {
        return;
      }
      loadingEl.remove();
      renderLogEntries(
        containerEl,
        entries,
        this.plugin.settings.enableLogging
          ? "No log entries were recorded for this sync."
          : "Logging was disabled for this sync.",
      );
    } catch (error) {
      if (renderVersion !== this.syncActivityRenderVersion) {
        return;
      }
      loadingEl.setText(`Unable to read sync logs: ${String(error)}`);
    }
  }
}

function getSyncStatusLabel(
  status: "syncing" | "success" | "error",
): string {
  switch (status) {
    case "syncing":
      return "In progress";
    case "success":
      return "Successful";
    case "error":
      return "Failed";
  }
}

function formatSyncTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}
