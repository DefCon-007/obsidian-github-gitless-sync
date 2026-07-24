import { Vault, normalizePath } from "obsidian";
import { LOG_FILE_NAME } from "./constants";
import { LogEntry, parseLogEntries, trimLogContent } from "./log-entry";

export { LOG_FILE_NAME } from "./constants";

const MAX_LOG_FILE_SIZE_BYTES = 1024 * 1024;
const LOG_TRIM_TARGET_BYTES = 768 * 1024;
const MAX_LOG_ENTRY_SIZE_BYTES = 64 * 1024;
const LOG_ENTRY_PREVIEW_CHARACTERS = 8192;

export default class Logger {
  private logFile: string;
  private syncId: string | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private vault: Vault,
    private enabled: boolean,
  ) {
    this.logFile = normalizePath(`${vault.configDir}/${LOG_FILE_NAME}`);
  }

  async init() {
    // Create the log file in case it doesn't exist
    if (await this.vault.adapter.exists(this.logFile)) {
      return;
    }
    await this.vault.adapter.write(this.logFile, "");
  }

  private async write(
    level: string,
    message: string,
    data?: any,
  ): Promise<void> {
    if (!this.enabled) return;

    const logEntry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message,
      additional_data: data,
      sync_id: this.syncId ?? undefined,
    };

    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await this.vault.adapter.append(
          this.logFile,
          `${this.serializeEntry(logEntry)}\n`,
        );
        await this.trimIfNeeded();
      });
    return this.writeQueue;
  }

  async read(): Promise<string> {
    await this.writeQueue.catch(() => undefined);
    return await this.vault.adapter.read(this.logFile);
  }

  async readEntries(): Promise<LogEntry[]> {
    return parseLogEntries(await this.read());
  }

  async clean(): Promise<void> {
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(() => this.vault.adapter.write(this.logFile, ""));
    return this.writeQueue;
  }

  startSyncRun(syncId: string): void {
    this.syncId = syncId;
  }

  endSyncRun(): void {
    this.syncId = null;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  async info(message: string, data?: any): Promise<void> {
    await this.write("INFO", message, data);
  }

  async warn(message: string, data?: any): Promise<void> {
    await this.write("WARN", message, data);
  }

  async error(message: string, data?: any): Promise<void> {
    await this.write("ERROR", message, data);
  }

  private serializeEntry(logEntry: Record<string, unknown>): string {
    const encoder = new TextEncoder();
    try {
      const serialized = JSON.stringify(logEntry);
      const originalSizeBytes = encoder.encode(serialized).byteLength;
      if (originalSizeBytes <= MAX_LOG_ENTRY_SIZE_BYTES) {
        return serialized;
      }

      const additionalData = JSON.stringify(logEntry.additional_data);
      return JSON.stringify({
        ...logEntry,
        additional_data: {
          truncated: true,
          originalSizeBytes,
          preview: additionalData.slice(0, LOG_ENTRY_PREVIEW_CHARACTERS),
        },
      });
    } catch (error) {
      return JSON.stringify({
        timestamp: logEntry.timestamp,
        level: logEntry.level,
        message: logEntry.message,
        sync_id: logEntry.sync_id,
        additional_data: {
          truncated: true,
          reason: "Additional log data could not be serialized",
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async trimIfNeeded(): Promise<void> {
    const stat = await this.vault.adapter.stat(this.logFile);
    if (stat === null || stat.size <= MAX_LOG_FILE_SIZE_BYTES) {
      return;
    }

    const logs = await this.vault.adapter.read(this.logFile);
    const trimmedLogs = trimLogContent(
      logs,
      MAX_LOG_FILE_SIZE_BYTES,
      LOG_TRIM_TARGET_BYTES,
    );
    await this.vault.adapter.write(this.logFile, trimmedLogs);
  }
}
