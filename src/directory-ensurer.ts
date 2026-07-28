import type { DataAdapter } from "obsidian";

type DirectoryAdapter = Pick<DataAdapter, "exists" | "mkdir">;

/**
 * Creates vault directories without racing concurrent callers that need the
 * same parent. Android's adapter can reject overlapping mkdir calls even when
 * the directory is successfully created by one of them.
 */
export default class DirectoryEnsurer {
  private pending = new Map<string, Promise<void>>();

  constructor(private adapter: DirectoryAdapter) {}

  async ensure(directoryPath: string): Promise<void> {
    if (directoryPath === "" || directoryPath === "/") {
      return;
    }

    const pendingCreation = this.pending.get(directoryPath);
    if (pendingCreation !== undefined) {
      return pendingCreation;
    }

    const creation = this.create(directoryPath);
    this.pending.set(directoryPath, creation);

    try {
      await creation;
    } finally {
      if (this.pending.get(directoryPath) === creation) {
        this.pending.delete(directoryPath);
      }
    }
  }

  private async create(directoryPath: string): Promise<void> {
    const parentPath = directoryPath.split("/").slice(0, -1).join("/");
    await this.ensure(parentPath);

    if (!(await this.adapter.exists(directoryPath))) {
      await this.adapter.mkdir(directoryPath);
    }
  }
}
