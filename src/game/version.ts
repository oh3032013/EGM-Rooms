// Startup Force-Update, Server-Only Sync & Differential Delta Patch Engine

export const APP_VERSION = '1.0.0';
export const VERSION_CACHE_TTL_MS = 120_000;
const VERSION_CACHE_STORAGE_KEY = 'ecogrow_version_cache_v1';
const APPLIED_SERVER_REV_KEY = 'ecogrow_applied_server_rev_v1';
const SAVED_FEED_URL_KEY = 'ecogrow_version_feed_url_v1';
const LOCAL_PATCH_HASHES_KEY = 'ecogrow_patch_hashes_v1';
const DELTA_CACHE_NAME = 'ecogrow-delta-v1';
const REQUEST_TIMEOUT_MS = 4_500;
const PATCH_FILE_TIMEOUT_MS = 15_000;

export type UpdateMode = 'auto' | 'server_only' | 'delta_files';

export interface VersionManifest {
  latest_version: string;
  min_supported_version: string;
  server_revision: string;
  min_server_revision: string;
  update_mode: UpdateMode;
  multiplayer_url: string;
  version_feed_url?: string;
  patch_manifest_url: string;
  update_url: string;
  message_ar: string;
  message_en: string;
}

export interface PatchFileEntry {
  path: string;
  sha256: string;
  size: number;
}

export interface PatchManifest {
  version: string;
  server_revision: string;
  files: PatchFileEntry[];
}

export interface DeltaUpdateProgress {
  phase: 'checking' | 'diffing' | 'downloading' | 'applying' | 'done';
  changedFiles: number;
  totalFiles: number;
  completedFiles: number;
  skippedFiles: number;
  downloadedBytes: number;
  totalBytes: number;
}

export interface InPlaceUpdateResult {
  ok: boolean;
  kind: 'server_only' | 'delta_files';
  reloaded: boolean;
  changedFiles: number;
  totalFiles: number;
  error?: string;
}

export type VersionCheckStatus =
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'update_required'
  | 'error_offline';

export interface VersionCheckResult {
  status: Exclude<VersionCheckStatus, 'idle' | 'checking'>;
  manifest: VersionManifest | null;
  fromCache: boolean;
  nextRetryAtMs: number;
  cooldownMs: number;
  recheckFailed?: boolean;
}

const ALLOWED_PATCH_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.svg',
  '.png',
  '.ico',
  '.woff',
  '.woff2',
  '.webmanifest',
  '.txt',
]);

export function parseSemver(raw: string): [number, number, number] {
  const clean = String(raw || '')
    .trim()
    .replace(/^[vV]/, '')
    .split(/[-+]/)[0];
  if (!clean) return [0, 0, 0];
  const parts = clean.split('.');
  const major = Number.parseInt(parts[0] ?? '0', 10);
  const minor = Number.parseInt(parts[1] ?? '0', 10);
  const patch = Number.parseInt(parts[2] ?? '0', 10);
  return [
    Number.isFinite(major) && major >= 0 ? major : 0,
    Number.isFinite(minor) && minor >= 0 ? minor : 0,
    Number.isFinite(patch) && patch >= 0 ? patch : 0,
  ];
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

export function isVersionSupported(currentVersion: string, minSupportedVersion: string): boolean {
  if (!/\d/.test(currentVersion) || !/\d/.test(minSupportedVersion)) {
    return true;
  }
  return compareSemver(currentVersion, minSupportedVersion) >= 0;
}

export function isNewerVersionAvailable(currentVersion: string, latestVersion: string): boolean {
  if (!/\d/.test(currentVersion) || !/\d/.test(latestVersion)) {
    return false;
  }
  return compareSemver(latestVersion, currentVersion) > 0;
}

export function isServerRevisionSupported(appliedRevision: string, minServerRevision: string): boolean {
  const minClean = String(minServerRevision || '').trim();
  if (!minClean || !/\d/.test(minClean)) return true;
  const appliedClean = String(appliedRevision || '').trim();
  if (!appliedClean || !/\d/.test(appliedClean)) return false;
  return compareSemver(appliedClean, minClean) >= 0;
}

export function getAppliedServerRevision(): string {
  if (typeof window === 'undefined') return '1';
  try {
    return window.localStorage.getItem(APPLIED_SERVER_REV_KEY) || '1';
  } catch {
    return '1';
  }
}

export function saveAppliedServerRevision(rev: string): void {
  if (typeof window === 'undefined') return;
  const clean = String(rev || '').trim();
  if (!clean) return;
  try {
    window.localStorage.setItem(APPLIED_SERVER_REV_KEY, clean.slice(0, 32));
  } catch {
    // Ignore storage errors
  }
}

export function saveVersionFeedUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const clean = sanitizeUpdateUrl(url);
  if (!clean.startsWith('https://') && !clean.startsWith('http://')) return;
  try {
    window.localStorage.setItem(SAVED_FEED_URL_KEY, clean);
  } catch {
    // Ignore storage errors
  }
}

export function resolveVersionFeedUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(SAVED_FEED_URL_KEY);
      if (saved && (saved.startsWith('https://') || saved.startsWith('http://'))) {
        return saved;
      }
    } catch {
      // Ignore
    }
  }
  const envUrl =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
          ?.VITE_VERSION_FEED_URL
      : undefined;
  if (envUrl) {
    const clean = sanitizeUpdateUrl(envUrl);
    if (clean.startsWith('https://') || clean.startsWith('http://')) {
      return clean;
    }
  }
  return '';
}

export function isUpdateRequired(
  currentVersion: string,
  appliedServerRevision: string,
  manifest: VersionManifest
): boolean {
  const clientOutdated = !isVersionSupported(currentVersion, manifest.min_supported_version);
  const serverSyncNeeded = !isServerRevisionSupported(
    appliedServerRevision,
    manifest.min_server_revision
  );
  return clientOutdated || serverSyncNeeded;
}

export function resolveEffectiveUpdateKind(
  currentVersion: string,
  manifest: VersionManifest
): 'server_only' | 'delta_files' {
  if (manifest.update_mode === 'server_only') {
    return 'server_only';
  }
  if (manifest.update_mode === 'delta_files') {
    return 'delta_files';
  }
  return isVersionSupported(currentVersion, manifest.min_supported_version)
    ? 'server_only'
    : 'delta_files';
}

export function sanitizeUpdateUrl(rawUrl: string | undefined): string {
  const clean = String(rawUrl ?? '').trim();
  if (!clean) return './';
  if ((clean.startsWith('./') || clean.startsWith('/')) && !clean.startsWith('//')) {
    return clean;
  }
  try {
    const parsed = new URL(clean);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Reject malformed or non-HTTP(S) schemes such as javascript: or data:
  }
  return './';
}

export function sanitizePatchFilePath(rawPath: string): string | null {
  const normalized = String(rawPath || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..') || /[\0?#]/.test(normalized)) {
    return null;
  }
  const dotIdx = normalized.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  const ext = normalized.slice(dotIdx).toLowerCase();
  if (!ALLOWED_PATCH_EXTENSIONS.has(ext)) return null;
  return normalized;
}

export function diffPatchFiles(
  serverFiles: PatchFileEntry[],
  localHashes: Record<string, string>
): { changed: PatchFileEntry[]; unchanged: PatchFileEntry[] } {
  const changed: PatchFileEntry[] = [];
  const unchanged: PatchFileEntry[] = [];
  for (const entry of serverFiles) {
    const safePath = sanitizePatchFilePath(entry.path);
    if (!safePath) continue;
    const normalizedEntry: PatchFileEntry = {
      path: safePath,
      sha256: String(entry.sha256 || '').toLowerCase(),
      size: Number.isFinite(entry.size) && entry.size >= 0 ? Math.floor(entry.size) : 0,
    };
    const localHash = String(localHashes[safePath] || '').toLowerCase();
    if (localHash && localHash === normalizedEntry.sha256) {
      unchanged.push(normalizedEntry);
    } else {
      changed.push(normalizedEntry);
    }
  }
  return { changed, unchanged };
}

export function computeBackoffMs(consecutiveFailures: number): number {
  if (!Number.isFinite(consecutiveFailures) || consecutiveFailures <= 0) return 0;
  const clamped = Math.min(6, Math.floor(consecutiveFailures));
  return Math.min(60_000, 3_000 * Math.pow(2, clamped - 1));
}

export function parseVersionManifest(raw: unknown): VersionManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const latest = typeof obj.latest_version === 'string' ? obj.latest_version.trim() : '';
  const minSupported =
    typeof obj.min_supported_version === 'string' ? obj.min_supported_version.trim() : '';
  if (!/\d/.test(latest) || !/\d/.test(minSupported)) return null;

  const rawMode = typeof obj.update_mode === 'string' ? obj.update_mode.trim() : 'auto';
  const updateMode: UpdateMode =
    rawMode === 'server_only' || rawMode === 'delta_files' ? rawMode : 'auto';

  const serverRevision =
    typeof obj.server_revision === 'string' && obj.server_revision.trim()
      ? obj.server_revision.trim().slice(0, 32)
      : '1';
  const minServerRevision =
    typeof obj.min_server_revision === 'string' && obj.min_server_revision.trim()
      ? obj.min_server_revision.trim().slice(0, 32)
      : '1';

  const rawMpUrl = typeof obj.multiplayer_url === 'string' ? obj.multiplayer_url.trim() : '';
  const multiplayerUrl = rawMpUrl ? sanitizeUpdateUrl(rawMpUrl) : '';
  const rawFeedUrl = typeof obj.version_feed_url === 'string' ? obj.version_feed_url.trim() : '';
  const sanitizedFeedUrl = rawFeedUrl ? sanitizeUpdateUrl(rawFeedUrl) : '';
  const versionFeedUrl =
    sanitizedFeedUrl && (sanitizedFeedUrl.startsWith('https://') || sanitizedFeedUrl.startsWith('http://'))
      ? sanitizedFeedUrl
      : '';
  const patchManifestUrl =
    typeof obj.patch_manifest_url === 'string' && obj.patch_manifest_url.trim()
      ? sanitizeUpdateUrl(obj.patch_manifest_url)
      : '/api/patch-manifest';

  const messageAr =
    typeof obj.message_ar === 'string' && obj.message_ar.trim()
      ? obj.message_ar.trim().slice(0, 400)
      : 'يتوفر إصدار جديد مطلوب من EcoGrow Mission. يرجى التحديث للمتابعة.';
  const messageEn =
    typeof obj.message_en === 'string' && obj.message_en.trim()
      ? obj.message_en.trim().slice(0, 400)
      : 'A required update for EcoGrow Mission is available. Please update to continue.';

  return {
    latest_version: latest.slice(0, 32),
    min_supported_version: minSupported.slice(0, 32),
    server_revision: serverRevision,
    min_server_revision: minServerRevision,
    update_mode: updateMode,
    multiplayer_url: multiplayerUrl === './' && !rawMpUrl ? '' : multiplayerUrl,
    ...(versionFeedUrl ? { version_feed_url: versionFeedUrl } : {}),
    patch_manifest_url: patchManifestUrl,
    update_url: sanitizeUpdateUrl(typeof obj.update_url === 'string' ? obj.update_url : './'),
    message_ar: messageAr,
    message_en: messageEn,
  };
}

export function parsePatchManifest(raw: unknown): PatchManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const version = typeof obj.version === 'string' ? obj.version.trim().slice(0, 32) : APP_VERSION;
  const serverRevision =
    typeof obj.server_revision === 'string' ? obj.server_revision.trim().slice(0, 32) : '1';
  if (!Array.isArray(obj.files)) return null;

  const files: PatchFileEntry[] = [];
  for (const item of obj.files) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const safePath = sanitizePatchFilePath(typeof rec.path === 'string' ? rec.path : '');
    const sha256 = typeof rec.sha256 === 'string' ? rec.sha256.trim().toLowerCase() : '';
    const size = typeof rec.size === 'number' && Number.isFinite(rec.size) ? Math.max(0, Math.floor(rec.size)) : 0;
    if (!safePath || !/^[a-f0-9]{64}$/.test(sha256)) continue;
    files.push({ path: safePath, sha256, size });
  }
  return { version, server_revision: serverRevision, files };
}

interface StoredVersionCache {
  manifest: VersionManifest;
  checkedAt: number;
}

export class StartupVersionChecker {
  private memoryCache: StoredVersionCache | null = null;
  private inFlight: Promise<VersionCheckResult> | null = null;
  private consecutiveFailures = 0;
  private nextRetryAtMs = 0;

  private readCache(nowMs: number): StoredVersionCache | null {
    if (this.memoryCache && nowMs - this.memoryCache.checkedAt < VERSION_CACHE_TTL_MS) {
      return this.memoryCache;
    }
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(VERSION_CACHE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { manifest?: unknown; checkedAt?: unknown };
      const checkedAt = typeof parsed.checkedAt === 'number' ? parsed.checkedAt : 0;
      if (nowMs - checkedAt >= VERSION_CACHE_TTL_MS) return null;
      const manifest = parseVersionManifest(parsed.manifest);
      if (!manifest) return null;
      this.memoryCache = { manifest, checkedAt };
      return this.memoryCache;
    } catch {
      return null;
    }
  }

  private writeCache(manifest: VersionManifest, nowMs: number): void {
    this.memoryCache = { manifest, checkedAt: nowMs };
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        VERSION_CACHE_STORAGE_KEY,
        JSON.stringify({ manifest, checkedAt: nowMs })
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  public clearCache(): void {
    this.memoryCache = null;
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(VERSION_CACHE_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  public getCooldownRemainingMs(nowMs = Date.now()): number {
    return Math.max(0, this.nextRetryAtMs - nowMs);
  }

  public resetForTests(): void {
    this.memoryCache = null;
    this.inFlight = null;
    this.consecutiveFailures = 0;
    this.nextRetryAtMs = 0;
  }

  public async check(options?: {
    force?: boolean;
    apiBase?: string;
    feedUrl?: string;
    currentVersion?: string;
    appliedServerRevision?: string;
    fetchImpl?: typeof fetch;
    nowMs?: () => number;
  }): Promise<VersionCheckResult> {
    const force = Boolean(options?.force);
    const currentVersion = options?.currentVersion ?? APP_VERSION;
    const appliedServerRev = options?.appliedServerRevision ?? getAppliedServerRevision();
    const nowFn = options?.nowMs ?? Date.now;
    const now = nowFn();

    if (!force) {
      const cached = this.readCache(now);
      if (cached) {
        const required = isUpdateRequired(currentVersion, appliedServerRev, cached.manifest);
        return {
          status: required ? 'update_required' : 'up_to_date',
          manifest: cached.manifest,
          fromCache: true,
          nextRetryAtMs: 0,
          cooldownMs: 0,
        };
      }
    }

    if (now < this.nextRetryAtMs) {
      const prevRequired =
        this.memoryCache &&
        isUpdateRequired(currentVersion, appliedServerRev, this.memoryCache.manifest);
      return {
        status: prevRequired ? 'update_required' : 'error_offline',
        manifest: prevRequired ? this.memoryCache!.manifest : null,
        fromCache: true,
        nextRetryAtMs: this.nextRetryAtMs,
        cooldownMs: this.nextRetryAtMs - now,
        recheckFailed: true,
      };
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    const fetchFn = options?.fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) {
      return {
        status: 'error_offline',
        manifest: null,
        fromCache: false,
        nextRetryAtMs: 0,
        cooldownMs: 0,
      };
    }

    const base = (options?.apiBase ?? '').replace(/\/+$/, '');
    const apiEndpoint = base ? `${base}/api/version` : '/api/version';
    const feedEndpoint = (options?.feedUrl ?? resolveVersionFeedUrl()).trim();
    const fallbackEndpoint = './version.json';

    const runCheck = async (): Promise<VersionCheckResult> => {
      const endpoints = Array.from(
        new Set(
          [apiEndpoint, feedEndpoint, fallbackEndpoint].filter(
            (item): item is string => Boolean(item)
          )
        )
      );

      for (const endpoint of endpoints) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId =
          controller && typeof setTimeout === 'function'
            ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
            : null;
        try {
          const res = await fetchFn(endpoint, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: force ? 'no-store' : 'default',
            ...(controller ? { signal: controller.signal } : {}),
          });
          if (!res.ok) {
            if (res.status === 404) continue;
            throw new Error(`HTTP ${res.status}`);
          }
          const json: unknown = await res.json();
          const manifest = parseVersionManifest(json);
          if (!manifest) {
            continue;
          }
          if (manifest.version_feed_url) {
            saveVersionFeedUrl(manifest.version_feed_url);
          }
          const resolvedAt = nowFn();
          this.consecutiveFailures = 0;
          this.nextRetryAtMs = 0;
          this.writeCache(manifest, resolvedAt);
          const required = isUpdateRequired(currentVersion, appliedServerRev, manifest);
          return {
            status: required ? 'update_required' : 'up_to_date',
            manifest,
            fromCache: false,
            nextRetryAtMs: 0,
            cooldownMs: 0,
          };
        } catch {
          // Try next fallback endpoint or record failure below
        } finally {
          if (timeoutId !== null && typeof clearTimeout === 'function') {
            clearTimeout(timeoutId);
          }
        }
      }

      const failedAt = nowFn();
      this.consecutiveFailures += 1;
      const backoffMs = computeBackoffMs(this.consecutiveFailures);
      this.nextRetryAtMs = failedAt + backoffMs;
      const prevRequired =
        this.memoryCache &&
        isUpdateRequired(currentVersion, appliedServerRev, this.memoryCache.manifest);
      return {
        status: prevRequired ? 'update_required' : 'error_offline',
        manifest: prevRequired ? this.memoryCache!.manifest : null,
        fromCache: Boolean(prevRequired),
        nextRetryAtMs: this.nextRetryAtMs,
        cooldownMs: backoffMs,
        recheckFailed: true,
      };
    };

    this.inFlight = runCheck().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
}

export const startupVersionChecker = new StartupVersionChecker();

function readLocalPatchHashes(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_PATCH_HASHES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeLocalPatchHashes(hashes: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_PATCH_HASHES_KEY, JSON.stringify(hashes));
  } catch {
    // Ignore storage quota errors
  }
}

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function guessContentType(relPath: string): string {
  if (relPath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (relPath.endsWith('.js') || relPath.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (relPath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (relPath.endsWith('.json') || relPath.endsWith('.webmanifest')) return 'application/json; charset=utf-8';
  if (relPath.endsWith('.svg')) return 'image/svg+xml';
  if (relPath.endsWith('.png')) return 'image/png';
  if (relPath.endsWith('.ico')) return 'image/x-icon';
  if (relPath.endsWith('.woff2')) return 'font/woff2';
  if (relPath.endsWith('.woff')) return 'font/woff';
  return 'application/octet-stream';
}

type ElectronPatchAPI = {
  applyDeltaPatch?: (payload: {
    baseUrl: string;
    files: PatchFileEntry[];
    version: string;
    serverRevision: string;
  }) => Promise<{ ok: boolean; changedFiles: number; totalFiles: number; error?: string }>;
  onPatchProgress?: (cb: (progress: DeltaUpdateProgress) => void) => () => void;
};

export async function performInPlaceUpdate(options: {
  manifest: VersionManifest;
  apiBase?: string;
  currentVersion?: string;
  localHashes?: Record<string, string>;
  fetchImpl?: typeof fetch;
  onProgress?: (progress: DeltaUpdateProgress) => void;
  onApplyServerUrl?: (newUrl: string) => void;
}): Promise<InPlaceUpdateResult> {
  const { manifest } = options;
  const currentVersion = options.currentVersion ?? APP_VERSION;
  const targetHttpUrl =
    manifest.multiplayer_url &&
    (manifest.multiplayer_url.startsWith('https://') ||
      manifest.multiplayer_url.startsWith('http://'))
      ? manifest.multiplayer_url
      : '';
  const base = (targetHttpUrl || options.apiBase || '').replace(/\/+$/, '');
  const fetchFn = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  const effectiveKind = resolveEffectiveUpdateKind(currentVersion, manifest);

  startupVersionChecker.clearCache();

  // 1) Server-only update: apply right in the same page with zero asset downloads
  if (effectiveKind === 'server_only') {
    options.onProgress?.({
      phase: 'applying',
      changedFiles: 0,
      totalFiles: 0,
      completedFiles: 0,
      skippedFiles: 0,
      downloadedBytes: 0,
      totalBytes: 0,
    });
    if (manifest.multiplayer_url) {
      options.onApplyServerUrl?.(manifest.multiplayer_url);
    }
    saveAppliedServerRevision(manifest.server_revision);
    options.onProgress?.({
      phase: 'done',
      changedFiles: 0,
      totalFiles: 0,
      completedFiles: 0,
      skippedFiles: 0,
      downloadedBytes: 0,
      totalBytes: 0,
    });
    return {
      ok: true,
      kind: 'server_only',
      reloaded: false,
      changedFiles: 0,
      totalFiles: 0,
    };
  }

  // 2) Differential file update: fetch patch-manifest & download ONLY changed files in-place
  options.onProgress?.({
    phase: 'diffing',
    changedFiles: 0,
    totalFiles: 0,
    completedFiles: 0,
    skippedFiles: 0,
    downloadedBytes: 0,
    totalBytes: 0,
  });

  if (!fetchFn) {
    return {
      ok: false,
      kind: 'delta_files',
      reloaded: false,
      changedFiles: 0,
      totalFiles: 0,
      error: 'FETCH_UNAVAILABLE',
    };
  }

  let patchManifest: PatchManifest | null = null;
  const manifestCandidates = [
    base ? `${base}/api/patch-manifest` : '/api/patch-manifest',
    './patch-manifest.json',
  ];
  for (const url of manifestCandidates) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tid =
      controller && typeof setTimeout === 'function'
        ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        : null;
    try {
      const res = await fetchFn(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!res.ok) continue;
      const parsed = parsePatchManifest(await res.json());
      if (parsed) {
        patchManifest = parsed;
        break;
      }
    } catch {
      // Try next candidate
    } finally {
      if (tid !== null && typeof clearTimeout === 'function') {
        clearTimeout(tid);
      }
    }
  }

  if (!patchManifest) {
    // Fallback in-page refresh via SW / cache update without navigating away to any external site
    if (typeof window !== 'undefined') {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.update().catch(() => {})));
        }
        if ('caches' in window) {
          const keys = await window.caches.keys();
          await Promise.all(keys.map((k) => window.caches.delete(k)));
        }
      } catch {
        // Ignore
      }
      saveAppliedServerRevision(manifest.server_revision);
      window.location.reload();
      return {
        ok: true,
        kind: 'delta_files',
        reloaded: true,
        changedFiles: 0,
        totalFiles: 0,
      };
    }
    return {
      ok: false,
      kind: 'delta_files',
      reloaded: false,
      changedFiles: 0,
      totalFiles: 0,
      error: 'MANIFEST_UNAVAILABLE',
    };
  }

  // Electron desktop EXE: apply true filesystem delta OTA patch inside userData/hotfix-dist
  const win = typeof window !== 'undefined' ? (window as Window & { electronAPI?: ElectronPatchAPI }) : null;
  if (win?.electronAPI?.applyDeltaPatch) {
    const unsubscribe = win.electronAPI.onPatchProgress?.((progress) => {
      options.onProgress?.(progress);
    });
    try {
      const res = await win.electronAPI.applyDeltaPatch({
        baseUrl: base,
        files: patchManifest.files,
        version: manifest.latest_version,
        serverRevision: manifest.server_revision,
      });
      if (res.ok) {
        if (manifest.multiplayer_url) {
          options.onApplyServerUrl?.(manifest.multiplayer_url);
        }
        saveAppliedServerRevision(manifest.server_revision);
        return {
          ok: true,
          kind: 'delta_files',
          reloaded: true,
          changedFiles: res.changedFiles,
          totalFiles: res.totalFiles,
        };
      }
      return {
        ok: false,
        kind: 'delta_files',
        reloaded: false,
        changedFiles: res.changedFiles,
        totalFiles: res.totalFiles,
        error: res.error ?? 'PATCH_FAILED',
      };
    } finally {
      unsubscribe?.();
    }
  }

  // Browser / PWA / WebView: compute diff vs locally recorded SHA-256 hashes & download ONLY changed files
  const localHashes = options.localHashes ?? readLocalPatchHashes();
  const { changed, unchanged } = diffPatchFiles(patchManifest.files, localHashes);
  const totalBytes = changed.reduce((sum, f) => sum + f.size, 0);
  const totalFiles = patchManifest.files.length;
  let completedFiles = 0;
  let downloadedBytes = 0;

  options.onProgress?.({
    phase: 'downloading',
    changedFiles: changed.length,
    totalFiles,
    completedFiles: 0,
    skippedFiles: unchanged.length,
    downloadedBytes: 0,
    totalBytes,
  });

  let deltaCache: Cache | null = null;
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      deltaCache = await window.caches.open(DELTA_CACHE_NAME);
    } catch {
      deltaCache = null;
    }
  }

  const nextHashes: Record<string, string> = {};
  for (const item of unchanged) {
    nextHashes[item.path] = item.sha256;
  }

  // Download changed files in small batches of 4 to minimize server bursts
  const BATCH_SIZE = 4;
  try {
    for (let i = 0; i < changed.length; i += BATCH_SIZE) {
      const batch = changed.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (file) => {
          const candidates = [
            base ? `${base}/patch-files/${file.path}` : `/patch-files/${file.path}`,
            `./${file.path}`,
          ];
          let downloadedBuf: ArrayBuffer | null = null;
          for (const fileUrl of candidates) {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const tid =
              controller && typeof setTimeout === 'function'
                ? setTimeout(() => controller.abort(), PATCH_FILE_TIMEOUT_MS)
                : null;
            try {
              const res = await fetchFn(fileUrl, {
                method: 'GET',
                cache: 'no-store',
                ...(controller ? { signal: controller.signal } : {}),
              });
              if (!res.ok) continue;
              const buf = await res.arrayBuffer();
              const digest = await computeSha256Hex(buf);
              if (digest && digest !== file.sha256) {
                continue;
              }
              downloadedBuf = buf;
              if (deltaCache && typeof Response !== 'undefined') {
                await deltaCache
                  .put(
                    `./${file.path}`,
                    new Response(buf, {
                      status: 200,
                      headers: { 'Content-Type': guessContentType(file.path) },
                    })
                  )
                  .catch(() => {});
              }
              break;
            } catch {
              // Try fallback candidate
            } finally {
              if (tid !== null && typeof clearTimeout === 'function') {
                clearTimeout(tid);
              }
            }
          }
          if (!downloadedBuf) {
            throw new Error(`PATCH_FILE_FAILED:${file.path}`);
          }
          nextHashes[file.path] = file.sha256;
          completedFiles += 1;
          downloadedBytes += downloadedBuf.byteLength;
          options.onProgress?.({
            phase: 'downloading',
            changedFiles: changed.length,
            totalFiles,
            completedFiles,
            skippedFiles: unchanged.length,
            downloadedBytes,
            totalBytes,
          });
        })
      );
    }
  } catch (err) {
    return {
      ok: false,
      kind: 'delta_files',
      reloaded: false,
      changedFiles: changed.length,
      totalFiles,
      error: err instanceof Error ? err.message : 'PATCH_FILE_FAILED',
    };
  }

  options.onProgress?.({
    phase: 'applying',
    changedFiles: changed.length,
    totalFiles,
    completedFiles: changed.length,
    skippedFiles: unchanged.length,
    downloadedBytes,
    totalBytes,
  });

  writeLocalPatchHashes(nextHashes);
  if (manifest.multiplayer_url) {
    options.onApplyServerUrl?.(manifest.multiplayer_url);
  }
  saveAppliedServerRevision(manifest.server_revision);

  if (typeof window !== 'undefined') {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
      }
    } catch {
      // Ignore SW update errors
    }
    options.onProgress?.({
      phase: 'done',
      changedFiles: changed.length,
      totalFiles,
      completedFiles: changed.length,
      skippedFiles: unchanged.length,
      downloadedBytes,
      totalBytes,
    });
    window.location.reload();
  }

  return {
    ok: true,
    kind: 'delta_files',
    reloaded: typeof window !== 'undefined',
    changedFiles: changed.length,
    totalFiles,
  };
}
