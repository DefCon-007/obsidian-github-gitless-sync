import { App, Modal } from "obsidian";

export default class LogViewerModal extends Modal {
  constructor(
    app: App,
    private logs: string,
  ) {
    super(app);
  }

  onOpen() {
    this.setTitle("GitHub Gitless Sync logs");
    this.contentEl.createEl("pre", {
      cls: "github-sync-log-viewer",
      text: this.logs || "No sync logs have been recorded yet.",
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
