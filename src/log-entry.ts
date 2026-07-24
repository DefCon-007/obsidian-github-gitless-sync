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

export function newestLogEntriesFirst(entries: LogEntry[]): LogEntry[] {
  return [...entries].reverse();
}

export function trimLogContent(
  logs: string,
  maximumBytes: number,
  targetBytes: number,
): string {
  const encoder = new TextEncoder();
  if (encoder.encode(logs).byteLength <= maximumBytes) {
    return logs;
  }

  const lines = logs
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);
  const retainedLines: string[] = [];
  let retainedBytes = 0;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = `${lines[index]}\n`;
    const lineBytes = encoder.encode(line).byteLength;
    if (retainedBytes + lineBytes > targetBytes) {
      break;
    }
    retainedLines.unshift(lines[index]);
    retainedBytes += lineBytes;
  }

  return retainedLines.length > 0 ? `${retainedLines.join("\n")}\n` : "";
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
