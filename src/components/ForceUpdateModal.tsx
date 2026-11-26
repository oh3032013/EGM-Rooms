import { AudioLines, CheckCircle2, DownloadCloud, Languages, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { LANGUAGE_OPTIONS, UI_TEXT, type Language } from '../game/i18n';
import {
  APP_VERSION,
  resolveEffectiveUpdateKind,
  type DeltaUpdateProgress,
  type VersionManifest,
} from '../game/version';

interface ForceUpdateModalProps {
  lang: Language;
  manifest: VersionManifest;
  checking: boolean;
  updating: boolean;
  progress: DeltaUpdateProgress | null;
  updateError: string | null;
  recheckOffline: boolean;
  cooldownSec: number;
  blindMode: boolean;
  blindCaption: string;
  onSelectLanguage: (lang: Language) => void;
  onToggleBlindMode: () => void;
  onUpdateNow: () => void;
  onRecheck: () => void;
}

export function ForceUpdateModal({
  lang,
  manifest,
  checking,
  updating,
  progress,
  updateError,
  recheckOffline,
  cooldownSec,
  blindMode,
  blindCaption,
  onSelectLanguage,
  onToggleBlindMode,
  onUpdateNow,
  onRecheck,
}: ForceUpdateModalProps) {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';
  const serverMessage =
    lang === 'ar' ? manifest.message_ar : manifest.message_en || manifest.message_ar;
  const recheckDisabled = checking || updating || cooldownSec > 0;
  const effectiveKind = resolveEffectiveUpdateKind(APP_VERSION, manifest);
  const modeLabel =
    effectiveKind === 'server_only' ? t.forceUpdateModeServerOnly : t.forceUpdateModeDelta;

  const progressPct = !progress
    ? 0
    : progress.phase === 'done' || progress.phase === 'applying'
    ? 100
    : progress.totalBytes > 0
    ? Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100))
    : progress.changedFiles > 0
    ? Math.min(100, Math.round((progress.completedFiles / progress.changedFiles) * 100))
    : 15;

  const progressText = !progress
    ? ''
    : progress.phase === 'done' && effectiveKind === 'server_only'
    ? t.forceUpdateServerOnlyMsg
    : progress.phase === 'done' || progress.phase === 'applying'
    ? t.forceUpdateReadyReload
    : progress.changedFiles > 0
    ? t.forceUpdateProgressFiles
        .replace('{done}', String(progress.completedFiles))
        .replace('{total}', String(progress.changedFiles))
        .replace('{skipped}', String(progress.skippedFiles))
    : t.forceUpdateDownloading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center safe-area-modal bg-black/80 backdrop-blur-sm pointer-events-auto"
      dir={isRtl ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="force-update-title"
      data-testid="force-update-modal"
    >
      <div className="parchment-panel rounded-xl w-full max-w-md max-h-[92dvh] overflow-y-auto modal-scroll p-4 sm:p-6 [@media(max-height:500px)]:p-3.5 text-center shadow-2xl">
        {/* Compact Accessibility & Language Bar so users can always read/hear in their language */}
        <div className="flex items-center justify-between gap-2 mb-3 [@media(max-height:500px)]:mb-2">
          <button
            type="button"
            onClick={onToggleBlindMode}
            aria-pressed={blindMode}
            aria-label={blindMode ? t.blindModeOn : t.blindModeOff}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              blindMode ? 'wood-button-primary ring-2 ring-[#f7d87c]' : 'wood-button'
            }`}
          >
            <AudioLines className="w-3.5 h-3.5 shrink-0" />
            <span>{t.blindModeBtn}</span>
          </button>

          <div className="wood-button min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5 shrink-0 pointer-events-none" />
            <select
              value={lang}
              aria-label={t.languageLabel}
              onChange={(e) => onSelectLanguage(e.target.value as Language)}
              className="bg-transparent text-inherit font-semibold text-xs cursor-pointer focus:outline-none max-w-[110px]"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code} className="bg-[#f5ebd6] text-[#2c1e14]">
                  {opt.nativeName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mx-auto mb-2.5 [@media(max-height:500px)]:mb-1.5 w-12 h-12 [@media(max-height:500px)]:w-10 [@media(max-height:500px)]:h-10 rounded-full bg-[#3f7a38]/15 border border-[#3f7a38]/40 flex items-center justify-center text-[#2c5c26]">
          {effectiveKind === 'server_only' ? (
            <Server className="w-6 h-6 [@media(max-height:500px)]:w-5 [@media(max-height:500px)]:h-5" />
          ) : (
            <DownloadCloud className="w-6 h-6 [@media(max-height:500px)]:w-5 [@media(max-height:500px)]:h-5" />
          )}
        </div>

        <h2
          id="force-update-title"
          className="font-display text-xl sm:text-2xl font-bold text-[#2c1e14] mb-1 leading-tight"
        >
          {t.forceUpdateTitle}
        </h2>
        <p className="text-xs sm:text-sm font-semibold text-[#5c4028] mb-2 [@media(max-height:500px)]:mb-1.5">
          {t.forceUpdateSubtitle}
        </p>

        {/* Update Mode Indicator (Server-only vs Delta changed files) */}
        <p className="text-[11px] sm:text-xs font-bold text-[#2c5c26] mb-2.5 [@media(max-height:500px)]:mb-2">
          {modeLabel}
        </p>

        {/* Localized Update Message */}
        <p className="text-xs sm:text-sm text-[#3c2919] bg-[#eadbc0]/75 border border-[#c8ae82] rounded-lg px-3.5 py-2.5 [@media(max-height:500px)]:py-2 mb-3 leading-relaxed">
          {serverMessage}
        </p>

        {/* Clean Unboxed Version Metadata (Zero-Pill Rule + Tabular Numerals) */}
        <div
          className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs font-semibold text-[#5c4028] tabular-nums mb-3 [@media(max-height:500px)]:mb-2"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <span>
            {t.forceUpdateCurrentVer}: <strong className="text-[#8a2b1d]">v{APP_VERSION}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t.forceUpdateRequiredVer}:{' '}
            <strong className="text-[#2c1e14]">≥ v{manifest.min_supported_version}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t.forceUpdateLatestVer}:{' '}
            <strong className="text-[#2c5c26]">v{manifest.latest_version}</strong>
          </span>
        </div>

        {/* In-Page Differential / Server Sync Progress Bar */}
        {progress && (
          <div
            role="status"
            aria-live="polite"
            className="mb-3 bg-[#eadbc0]/90 border border-[#c8ae82] rounded-lg px-3 py-2.5 text-start"
          >
            <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#2c1e14] mb-1.5">
              <span className="flex items-center gap-1.5 min-w-0">
                {progress.phase === 'done' && (
                  <CheckCircle2 className="w-4 h-4 text-[#2c5c26] shrink-0" />
                )}
                <span className="truncate">{progressText}</span>
              </span>
              <span className="tabular-nums shrink-0 text-[#2c5c26]">{progressPct}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-[#d7c29e] overflow-hidden">
              <div
                className="h-full bg-[#3f7a38] transition-[width] duration-200 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Save Preservation Assurance */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-medium text-[#2c5c26] mb-3.5 [@media(max-height:500px)]:mb-2.5">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{t.forceUpdateSaveSafe}</span>
        </div>

        {(updateError || recheckOffline) && (
          <p
            role="status"
            aria-live="polite"
            className="text-xs font-semibold text-[#8a2b1d] mb-3 leading-snug"
          >
            {updateError || t.forceUpdateOfflineRetry}
            {!updateError && cooldownSec > 0 ? ` (${cooldownSec}s)` : ''}
          </p>
        )}

        {/* Responsive Touch-Friendly Action Buttons (>=44px height) */}
        <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
          <button
            type="button"
            data-testid="force-update-now-btn"
            disabled={updating}
            onClick={onUpdateNow}
            className="wood-button-primary flex-1 min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            <DownloadCloud className={`w-4 h-4 shrink-0 ${updating ? 'animate-bounce' : ''}`} />
            <span>{updating ? t.forceUpdateDownloading : t.forceUpdateBtn}</span>
          </button>

          <button
            type="button"
            data-testid="force-update-recheck-btn"
            disabled={recheckDisabled}
            onClick={onRecheck}
            className="wood-button flex-1 min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${checking ? 'animate-spin' : ''}`} />
            <span>
              {checking
                ? t.forceUpdateChecking
                : cooldownSec > 0
                ? `${t.forceUpdateRecheckBtn} (${cooldownSec}s)`
                : t.forceUpdateRecheckBtn}
            </span>
          </button>
        </div>

        {blindMode && (
          <div
            role="status"
            aria-live="assertive"
            className="mt-3 px-3 py-2 rounded-lg bg-[#18120c]/95 border border-[#f7d87c] text-[#fdf3dc] text-xs font-semibold"
          >
            {blindCaption || `${t.forceUpdateTitle} — ${serverMessage}`}
          </div>
        )}
      </div>
    </div>
  );
}
