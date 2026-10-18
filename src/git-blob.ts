export async function calculateGitBlobSha(
  contentBytes: Uint8Array,
): Promise<string> {
  const header = new TextEncoder().encode(`blob ${contentBytes.length}\0`);
  const store = new Uint8Array(header.length + contentBytes.length);
  store.set(header);
  store.set(contentBytes, header.length);

  const hash = await crypto.subtle.digest("SHA-1", store);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
