export type SyncState = "idle" | "syncing" | "success" | "error";

export interface SyncPresentation {
  icon: string;
  tooltip: string;
  statusText: string | null;
}

export function syncPresentation(state: SyncState): SyncPresentation {
  switch (state) {
    case "syncing":
      return {
        icon: "loader-circle",
        tooltip: "GitHub sync in progress",
        statusText: "GitHub: Syncing…",
      };
    case "success":
      return {
        icon: "check",
        tooltip: "Last GitHub sync succeeded",
        statusText: "GitHub: Synced",
      };
    case "error":
      return {
        icon: "circle-alert",
        tooltip: "Last GitHub sync failed",
        statusText: "GitHub: Sync failed",
      };
    case "idle":
      return {
        icon: "refresh-cw",
        tooltip: "Sync with GitHub",
        statusText: null,
      };
  }
}
