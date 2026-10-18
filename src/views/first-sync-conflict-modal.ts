import { App, Modal, Setting } from "obsidian";

/**
 * The action the user chose when the first sync could not start because both
 * the local vault and the remote repository already contain files.
 */
export type FirstSyncConflictChoice =
  | "forcePull"
  | "reconfigureRemote"
  | "cancel";

/**
 * Shown when a first sync is refused because both the local vault and the
 * remote GitHub repository already contain files. Instead of leaving the user
 * with a raw error, it offers the concrete recovery paths the plugin can
 * actually perform.
 */
export default class FirstSyncConflictModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly onChoice: (choice: FirstSyncConflictChoice) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("This vault and the GitHub repository both have files");

    this.contentEl.createEl("p", {
      text:
        "The first sync can't merge two sets of files automatically, so it " +
        "stopped to avoid losing anything. Pick how you want to continue.",
    });

    new Setting(this.contentEl)
      .setName("Replace this vault with the GitHub repository")
      .setDesc(
        "Permanently delete the local synced content and download everything " +
          "from the repository instead. Use this when the repository holds the " +
          "copy you want to keep.",
      )
      .addButton((button) =>
        button
          .setButtonText("Force pull")
          .setIcon("download")
          .setWarning()
          .onClick(() => this.choose("forcePull")),
      );

    new Setting(this.contentEl)
      .setName("Link a different or new repository")
      .setDesc(
        "Open the settings to point the plugin at another repository. To upload " +
          "this vault instead, create a new empty repository on GitHub and enter " +
          "its owner, name and branch here, then sync again.",
      )
      .addButton((button) =>
        button
          .setButtonText("Open settings")
          .setIcon("settings")
          .onClick(() => this.choose("reconfigureRemote")),
      );

    new Setting(this.contentEl).addButton((button) =>
      button.setButtonText("Cancel").onClick(() => this.choose("cancel")),
    );
  }

  onClose(): void {
    this.contentEl.empty();
    // If the modal was dismissed without an explicit choice (Escape, clicking
    // outside), treat it as a cancel so the caller's promise always settles.
    if (!this.resolved) {
      this.resolved = true;
      this.onChoice("cancel");
    }
  }

  private choose(choice: FirstSyncConflictChoice): void {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    this.onChoice(choice);
    this.close();
  }
}
