import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const requiredFiles = ["main.js", "manifest.json", "styles.css"];
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));

if (typeof manifest.id !== "string" || manifest.id.length === 0) {
  throw new Error("manifest.json must contain a non-empty plugin id");
}

const outputDirectory = path.join("dist", manifest.id);

await rm("dist", { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await Promise.all(
  requiredFiles.map((file) =>
    copyFile(file, path.join(outputDirectory, file)),
  ),
);

console.log(`Release plugin created at ${outputDirectory}`);
