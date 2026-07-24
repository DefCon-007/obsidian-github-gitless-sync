import { LOG_FILE_NAME, MANIFEST_FILE_NAME } from "./constants";
import type { GitHubSyncSettings } from "./settings/settings";

export type AutomaticConflictAction = "upload" | "download" | null;

export const FIRST_SYNC_BOTH_SIDES_ERROR =
  "First sync cannot start because both this vault and the GitHub repository already contain files. " +
  "To prevent data loss, empty the repository to upload this vault, or use an empty vault to download the repository.";

export function vaultListingIsEmpty(
  files: string[],
  folders: string[],
  configDir: string,
): boolean {
  const contentFolders = folders.filter((folder) => folder !== configDir);
  return files.length === 0 && contentFolders.length === 0;
}

export function isSyncablePath(
  filePath: string,
  configDir: string,
  syncConfigDir: boolean,
): boolean {
  if (filePath === `${configDir}/${MANIFEST_FILE_NAME}`) {
    return true;
  }

  if (
    filePath === `${configDir}/workspace.json` ||
    filePath === `${configDir}/workspace-mobile.json` ||
    filePath === `${configDir}/${LOG_FILE_NAME}`
  ) {
    return false;
  }

  const isConfigPath =
    filePath === configDir || filePath.startsWith(`${configDir}/`);
  if (isConfigPath) {
    return syncConfigDir;
  }

  return true;
}

export function automaticConflictAction(
  handling: GitHubSyncSettings["conflictHandling"],
): AutomaticConflictAction {
  if (handling === "overwriteLocal") {
    return "download";
  }
  if (handling === "overwriteRemote") {
    return "upload";
  }
  return null;
}
