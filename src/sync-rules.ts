import {
  FORCE_PULL_STAGING_DIR_NAME,
  LOG_FILE_NAME,
  MANIFEST_FILE_NAME,
} from "./constants";
import type { FileMetadata } from "./metadata-store";
import type { GitHubSyncSettings } from "./settings/settings";

export type AutomaticConflictAction = "upload" | "download" | null;
export type FileSyncAction =
  | "upload"
  | "download"
  | "delete_local"
  | "delete_remote"
  | null;

export const FIRST_SYNC_BOTH_SIDES_ERROR =
  "First sync cannot start because both this vault and the GitHub repository already contain files. " +
  "To prevent data loss, empty the repository to upload this vault, or use an empty vault to download the repository.";

export function needsFirstSync(
  firstSyncSetting: boolean,
  localLastSync: number,
): boolean {
  return firstSyncSetting && localLastSync <= 0;
}

export function vaultListingIsEmpty(
  files: string[],
  folders: string[],
  configDir: string,
): boolean {
  const contentFolders = folders.filter((folder) => folder !== configDir);
  return files.length === 0 && contentFolders.length === 0;
}

export function findStaleRemoteMetadataPaths(
  remoteMetadata: Record<string, { deleted?: boolean | null }>,
  remoteTreeFiles: Record<string, unknown>,
): string[] {
  return Object.keys(remoteMetadata).filter((filePath) => {
    const metadata = remoteMetadata[filePath];
    return (
      !metadata.deleted &&
      !Object.prototype.hasOwnProperty.call(remoteTreeFiles, filePath)
    );
  });
}

export function determineFileSyncAction(
  remoteFile: FileMetadata,
  localFile: FileMetadata,
  localSHA: string | null,
): FileSyncAction {
  if (remoteFile.deleted && localFile.deleted) {
    return null;
  }

  if (remoteFile.deleted && !localFile.deleted) {
    // A tombstone retains the SHA of the file that was deleted. If the local
    // content still has that SHA, it has not been meaningfully changed and the
    // remote deletion must win regardless of timestamp or clock skew.
    if (remoteFile.sha === localSHA) {
      return "delete_local";
    }

    if ((remoteFile.deletedAt as number) > localFile.lastModified) {
      return "delete_local";
    }
    if (localFile.lastModified > (remoteFile.deletedAt as number)) {
      return "upload";
    }
    return null;
  }

  if (!remoteFile.deleted && localFile.deleted) {
    // The local tombstone also retains the last known remote SHA. If GitHub
    // still has that exact content, no remote edit superseded the deletion.
    if (remoteFile.sha === localFile.sha) {
      return "delete_remote";
    }

    if (remoteFile.lastModified > (localFile.deletedAt as number)) {
      return "download";
    }
    if ((localFile.deletedAt as number) > remoteFile.lastModified) {
      return "delete_remote";
    }
    return null;
  }

  if (localSHA === null) {
    // If the file disappeared without a vault deletion event, prefer restoring
    // the known remote content over treating an absent file as an upload. This
    // is both recoverable and avoids turning a missed mobile event into a read
    // failure or an accidental remote deletion.
    return "download";
  }

  if (remoteFile.sha === localSHA) {
    return null;
  }

  return localSHA !== localFile.sha ? "upload" : "download";
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
    filePath === `${configDir}/${FORCE_PULL_STAGING_DIR_NAME}` ||
    filePath.startsWith(`${configDir}/${FORCE_PULL_STAGING_DIR_NAME}/`) ||
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

export function isExtractableArchivePath(
  filePath: string,
  configDir: string,
  syncConfigDir: boolean,
  protectedPaths: string[] = [],
): boolean {
  if (filePath === `${configDir}/${MANIFEST_FILE_NAME}`) {
    // The local metadata store is rebuilt in memory while extracting the
    // archive and saved once extraction completes. Writing the remote copy
    // here would race those updates and briefly replace local sync state.
    return false;
  }

  if (
    protectedPaths.some(
      (protectedPath) =>
        filePath === protectedPath ||
        filePath.startsWith(`${protectedPath}/`),
    )
  ) {
    return false;
  }

  return isSyncablePath(filePath, configDir, syncConfigDir);
}

export function shouldDeleteLocalPathForForcePull(
  filePath: string,
  configDir: string,
  syncConfigDir: boolean,
  protectedPaths: string[],
): boolean {
  if (!isSyncablePath(filePath, configDir, syncConfigDir)) {
    return false;
  }

  return !protectedPaths.some(
    (protectedPath) =>
      filePath === protectedPath ||
      filePath.startsWith(`${protectedPath}/`) ||
      protectedPath.startsWith(`${filePath}/`),
  );
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

/**
 * Characters that Android's filesystem rejects in a path segment. These are the
 * Windows/FAT reserved characters plus ASCII control characters. Obsidian on
 * desktop lets users create files containing them (it only blocks characters
 * forbidden by the current OS), but writing such a file through the Android
 * adapter fails with a native "FILE_NOTCREATED" error. Forward slash is the
 * path separator and is handled structurally, so it is not listed here.
 */
// eslint-disable-next-line no-control-regex
const ANDROID_FORBIDDEN_SEGMENT_CHARS = /[<>:"\\|?*\u0000-\u001f]/;

/**
 * Returns true when any segment of the given vault-relative path contains a
 * character the Android filesystem cannot represent. A trailing dot or space on
 * a segment is also rejected because Android (like Windows/FAT) silently strips
 * them, which breaks the exact-path round trip the sync relies on.
 */
export function hasAndroidUnsafePathSegment(filePath: string): boolean {
  return filePath.split("/").some((segment) => {
    if (segment === "") {
      return false;
    }
    if (ANDROID_FORBIDDEN_SEGMENT_CHARS.test(segment)) {
      return true;
    }
    const lastChar = segment[segment.length - 1];
    return lastChar === "." || lastChar === " ";
  });
}
