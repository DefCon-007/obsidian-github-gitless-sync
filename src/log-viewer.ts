import { App, Modal } from "obsidian";
import {
  formatLogData,
  LogEntry,
  newestLogEntriesFirst,
  parseLogEntries,
} from "./log-entry";

export default class LogViewerModal extends Modal {
  constructor(
    app: App,
    private logs: string,
  ) {
    super(app);
  }

  onOpen() {
    this.setTitle("GitHub Gitless Sync logs");
    const entries = parseLogEntries(this.logs);
    this.contentEl.createDiv({
      cls: "github-sync-log-summary",
      text: `${entries.length} log ${entries.length === 1 ? "entry" : "entries"} · newest first`,
    });
    renderLogEntries(
      this.contentEl,
      entries,
      "No sync logs have been recorded yet.",
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}

export function renderLogEntries(
  containerEl: HTMLElement,
  entries: LogEntry[],
  emptyMessage: string,
): void {
  const listEl = containerEl.createDiv("github-sync-log-list");

  if (entries.length === 0) {
    listEl.createDiv({
      cls: "github-sync-log-empty",
      text: emptyMessage,
    });
    return;
  }

  for (const entry of newestLogEntriesFirst(entries)) {
    const entryEl = listEl.createDiv("github-sync-log-entry");
    const headerEl = entryEl.createDiv("github-sync-log-entry-header");
    const levelClass = getLevelClass(entry.level);

    headerEl.createSpan({
      cls: `github-sync-log-level ${levelClass}`,
      text: entry.level,
    });
    headerEl.createSpan({
      cls: "github-sync-log-time",
      text: formatTimestamp(entry.timestamp),
    });
    entryEl.createDiv({
      cls: "github-sync-log-message",
      text: entry.message,
    });

    if (entry.additionalData !== undefined) {
      const detailsEl = entryEl.createEl("details", {
        cls: "github-sync-log-details",
      });
      detailsEl.createEl("summary", { text: "Details" });
      detailsEl.createEl("pre", {
        text: formatLogData(entry.additionalData),
      });
    }
  }
}

function formatTimestamp(timestamp: string | null): string {
  if (timestamp === null) {
    return "Unknown time";
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function getLevelClass(level: string): string {
  switch (level) {
    case "ERROR":
      return "is-error";
    case "WARN":
      return "is-warning";
    case "INFO":
      return "is-info";
    default:
      return "is-default";
  }
}
