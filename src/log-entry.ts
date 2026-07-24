export interface LogEntry {
  timestamp: string | null;
  level: string;
  message: string;
  additionalData?: unknown;
  syncId?: string;
  raw: boolean;
}

interface SerializedLogEntry {
  timestamp?: unknown;
  level?: unknown;
  message?: unknown;
  additional_data?: unknown;
  sync_id?: unknown;
}

export function parseLogEntries(logs: string): LogEntry[] {
  return logs
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => parseLogLine(line));
}

export function entriesForSync(
  entries: LogEntry[],
  syncId: string,
): LogEntry[] {
  return entries.filter((entry) => entry.syncId === syncId);
}

export function formatLogData(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function parseLogLine(line: string): LogEntry {
  try {
    const parsed = JSON.parse(line) as SerializedLogEntry;
    if (typeof parsed !== "object" || parsed === null) {
      return rawLogEntry(line);
    }

    return {
      timestamp:
        typeof parsed.timestamp === "string" ? parsed.timestamp : null,
      level:
        typeof parsed.level === "string" ? parsed.level.toUpperCase() : "LOG",
      message:
        typeof parsed.message === "string"
          ? parsed.message
          : "Log entry without a message",
      additionalData: parsed.additional_data,
      syncId: typeof parsed.sync_id === "string" ? parsed.sync_id : undefined,
      raw: false,
    };
  } catch {
    return rawLogEntry(line);
  }
}

function rawLogEntry(line: string): LogEntry {
  return {
    timestamp: null,
    level: "LOG",
    message: line,
    raw: true,
  };
}
