/**
 * Updater — checks GitHub Releases for a newer APK version.
 * Compares semantic version tags (v1.0.1 format).
 * Returns null if already up-to-date or check fails.
 */

const GITHUB_REPO = 'Tech-Ohmer/ohms-basket';
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface UpdateInfo {
  version: string;       // e.g. "1.0.2"
  tag: string;           // e.g. "v1.0.2"
  apkUrl: string;        // direct APK download link
  releaseUrl: string;    // GitHub release page URL
  notes: string;         // release body / changelog
}

/** Parse "v1.2.3" → [1, 2, 3] */
function parseVersion(tag: string): number[] {
  return tag.replace(/^v/, '').split('.').map(Number);
}

/** Returns true if remoteTag is strictly newer than localVersion */
function isNewer(remoteTag: string, localVersion: string): boolean {
  const remote = parseVersion(remoteTag);
  const local = parseVersion(localVersion);
  for (let i = 0; i < Math.max(remote.length, local.length); i++) {
    const r = remote[i] ?? 0;
    const l = local[i] ?? 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

/** Check for an update. Returns UpdateInfo if a newer release exists, null otherwise. */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      // 5 second timeout
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const remoteTag: string = data.tag_name ?? '';
    if (!isNewer(remoteTag, currentVersion)) return null;

    // Find the APK asset in the release
    const assets: { name: string; browser_download_url: string }[] = data.assets ?? [];
    const apkAsset = assets.find(a => a.name.endsWith('.apk'));
    if (!apkAsset) return null;

    return {
      version: remoteTag.replace(/^v/, ''),
      tag: remoteTag,
      apkUrl: apkAsset.browser_download_url,
      releaseUrl: data.html_url ?? `https://github.com/${GITHUB_REPO}/releases/latest`,
      notes: data.body ?? '',
    };
  } catch {
    // Network error, timeout, or API rate limit — silently ignore
    return null;
  }
}
