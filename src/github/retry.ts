export function isRetryableGithubStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
