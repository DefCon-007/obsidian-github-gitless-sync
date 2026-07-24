import { Vault, normalizePath } from "obsidian";
import { LOG_FILE_NAME } from "./constants";
import { LogEntry, parseLogEntries } from "./log-entry";

export { LOG_FILE_NAME } from "./constants";

export default class Logger {
  private logFile: string;
  private syncId: string | null = null;

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

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      additional_data: data,
      sync_id: this.syncId ?? undefined,
    };

    await this.vault.adapter.append(
      this.logFile,
      JSON.stringify(logEntry) + "\n",
    );
  }

  async read(): Promise<string> {
    return await this.vault.adapter.read(this.logFile);
  }

  async readEntries(): Promise<LogEntry[]> {
    return parseLogEntries(await this.read());
  }

  async clean(): Promise<void> {
    return await this.vault.adapter.write(this.logFile, "");
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
}
