import { useEffect, useRef, useState } from 'react';
import { AudioLines, BookOpen, Check, Compass, Copy, Eye, Flame, Gamepad2, Hammer, Headphones, Link2, LogOut, Maximize2, MessageSquare, Mic, MicOff, Minimize2, Moon, PackageCheck, Pause, PhoneOff, Satellite, Send, ShoppingBag, Trophy, Users, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { ITEMS } from '../game/constants';
import {
  formatMorningSummaryText,
  formatTimeLocalized,
  getItemLabel,
  getNearPromptLabel,
  translateSeason,
  translateWeather,
  UI_TEXT,
  type Language,
} from '../game/i18n';
import {
  PLAYER_PALETTE,
  type ChatMessage,
  type RemotePlayerState,
  type VoicePeerState,
} from '../game/multiplayer';
import type { DaySummary, ItemId, Season, TimePhase, WeatherType } from '../game/types';
import { BoltIcon, CoinIcon, HeartIcon, ItemIcon, TimeIcon, WeatherIcon } from './PixelIcons';

export interface RoomHudState {
  roomCode: string;
  roomName: string;
  playerId: string;
  hostId: string;
  players: RemotePlayerState[];
  sleepVotes: string[];
  chat: ChatMessage[];
  voiceStates: Record<string, VoicePeerState>;
  reconnecting: boolean;
}

export interface HudSnapshot {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  waterLevel: number;
  maxWaterLevel: number;
  gold: number;
  level: number;
  xp: number;
  day: number;
  dayOfSeason: number;
  season: Season;
  timeMinutes: number;
  timeClock: string;
  timePhase: TimePhase;
  weather: WeatherType;
  restorationPct: number;
  claimableMissions: number;
  hotbar: (ItemId | null)[];
  selectedHotbarIndex: number;
  inventory: Partial<Record<ItemId, number>>;
  nearPrompt: { action: 'sleep' | 'shop' | 'well' | 'bin'; label: string } | null;
  lowStamina: boolean;
  nightWarning: boolean;
}

interface GameHUDProps {
  hud: HudSnapshot;
  lang: Language;
  muted: boolean;
  touchControlsEnabled: boolean;
  isFullscreen: boolean;
  blindMode: boolean;
  blindCaption: string;
  morningSummary: DaySummary | null;
  dailyOrderReady?: boolean;
  harvestCombo?: number;
  sprintActive?: boolean;
  onSelectHotbar: (idx: number) => void;
  onTriggerNearPrompt: () => void;
  onOpenMissions: () => void;
  onOpenShop: () => void;
  onOpenCraft: () => void;
  onOpenNasa: () => void;
  onOpenAlmanac: () => void;
  onSleepNow: () => void;
  onToggleSprint?: () => void;
  onToggleMute: () => void;
  onToggleTouchControls: () => void;
  onToggleFullscreen: () => void;
  onToggleBlindMode: () => void;
  onBlindScan: () => void;
  onBlindGuide: () => void;
  onBlindStatus: () => void;
  onPause: () => void;
  onDismissSummary: () => void;
  roomHud?: RoomHudState | null;
  chatOpen?: boolean;
  unreadChatCount?: number;
  voiceLocal?: {
    enabled: boolean;
    muted: boolean;
    speaking: boolean;
    deafened: boolean;
    hasMic: boolean;
    notice: string | null;
    locallyMutedPeers: string[];
  };
  onToggleChat?: () => void;
  onSendChat?: (text: string) => void;
  onToggleSleepVote?: () => void;
  onLeaveRoom?: () => void;
  onJoinOrToggleVoiceMic?: () => void;
  onLeaveVoice?: () => void;
  onToggleVoiceDeafen?: () => void;
  onTogglePeerVoiceMute?: (peerId: string) => void;
  onDismissVoiceNotice?: () => void;
}

export function GameHUD({
  hud,
  lang,
  muted,
  touchControlsEnabled,
  isFullscreen,
  blindMode,
  blindCaption,
  morningSummary,
  dailyOrderReady = false,
  harvestCombo = 0,
  sprintActive = false,
  onSelectHotbar,
  onTriggerNearPrompt,
  onOpenMissions,
  onOpenShop,
  onOpenCraft,
  onOpenNasa,
  onOpenAlmanac,
  onSleepNow,
  onToggleSprint,
  onToggleMute,
  onToggleTouchControls,
  onToggleFullscreen,
  onToggleBlindMode,
  onBlindScan,
  onBlindGuide,
  onBlindStatus,
  onPause,
  onDismissSummary,
  roomHud = null,
  chatOpen = false,
  unreadChatCount = 0,
  voiceLocal,
  onToggleChat,
  onSendChat,
  onToggleSleepVote,
  onLeaveRoom,
  onJoinOrToggleVoiceMic,
  onLeaveVoice,
  onToggleVoiceDeafen,
  onTogglePeerVoiceMute,
  onDismissVoiceNotice,
}: GameHUDProps) {
  const t = UI_TEXT[lang];
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const activeItemId = hud.hotbar[hud.selectedHotbarIndex];
  const activeItem = activeItemId ? ITEMS[activeItemId] : null;
  const activeLabel = activeItemId ? getItemLabel(activeItemId, lang) : null;
  const healthPct = Math.max(0, Math.min(100, (hud.health / hud.maxHealth) * 100));
  const staminaPct = Math.max(0, Math.min(100, (hud.stamina / hud.maxStamina) * 100));
  const promptText = hud.nearPrompt ? getNearPromptLabel(hud.nearPrompt.action, lang) : null;

  useEffect(() => {
    if (chatOpen) {
      const id = window.setTimeout(() => chatInputRef.current?.focus(), 40);
      return () => window.clearTimeout(id);
    }
  }, [chatOpen]);

  const handleCopyRoomCode = async () => {
    if (!roomHud) return;
    try {
      await navigator.clipboard.writeText(roomHud.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Ignore clipboard errors in restricted iframes
    }
  };

  const handleCopyInviteLink = async () => {
    if (!roomHud) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomHud.roomCode);
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Ignore clipboard errors in restricted iframes
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = chatInput.trim();
    if (!clean || !onSendChat) return;
    onSendChat(clean);
    setChatInput('');
  };

  return (
    <div
      dir="ltr"
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-2 sm:p-4 [@media(max-height:500px)]:p-1.5"
    >
      {/* Top Perimeter Clusters + Top-Docked Blind Bar & Morning Report */}
      <div className="flex flex-col gap-1.5 sm:gap-2">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          {/* Top-Left: Vitality, Stamina, Gold & Homestead Progress */}
          <div className="wood-panel rounded-lg px-2 sm:px-3.5 py-1.5 sm:py-2.5 [@media(max-height:500px)]:py-1.5 [@media(max-height:500px)]:px-2.5 pointer-events-auto min-w-[126px] sm:min-w-[210px] [@media(max-height:500px)]:min-w-[172px]">
            <div className="flex items-center justify-between gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="flex items-center gap-1.5">
                <CoinIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="font-mono-tabular font-bold text-xs sm:text-base text-[#f7d87c]" data-testid="hud-gold">
                  {Math.round(hud.gold)}g
                </span>
                <span
                  data-testid="hud-level"
                  className="px-1.5 py-0.5 rounded bg-[#4a311e] border border-[#8a5d36] text-[10px] font-mono-tabular font-bold text-[#fde047]"
                >
                  Lv.{hud.level}
                </span>
              </div>
              <div className="text-[10px] sm:text-xs text-[#d6c2a3] font-mono-tabular" data-testid="hud-restoration">
                {Math.round(hud.restorationPct)}%
                <span className="hidden sm:inline"> {t.restored}</span>
              </div>
            </div>

            {/* Health Bar */}
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
              <HeartIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <div className="flex-1 h-2 sm:h-3 bg-[#24170f] rounded-sm border border-[#593c26] overflow-hidden">
                <div className="h-full bg-[#d94848]" style={{ width: `${healthPct}%` }} />
              </div>
              <span className="font-mono-tabular text-[10px] sm:text-xs text-[#f5ebd6] w-10 sm:w-14 text-right">
                {Math.round(hud.health)}/{hud.maxHealth}
              </span>
            </div>

            {/* Stamina Bar */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <BoltIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <div className="flex-1 h-2 sm:h-3 bg-[#24170f] rounded-sm border border-[#593c26] overflow-hidden">
                <div
                  className={`${hud.lowStamina ? 'bg-[#e87c35]' : 'bg-[#ebc03f]'} h-full`}
                  style={{ width: `${staminaPct}%` }}
                />
              </div>
              <span className="font-mono-tabular text-[10px] sm:text-xs text-[#f5ebd6] w-10 sm:w-14 text-right" data-testid="hud-stamina">
                {Math.round(hud.stamina)}/{hud.maxStamina}
              </span>
            </div>

            {hud.lowStamina && (
              <div
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                className="mt-1 flex items-center justify-between gap-2 text-[10px] sm:text-xs text-[#ffbe76]"
              >
                <span>{t.lowStam}</span>
                <button
                  type="button"
                  onClick={onSleepNow}
                  className="underline hover:text-white cursor-pointer whitespace-nowrap"
                >
                  {t.rest}
                </button>
              </div>
            )}
            {harvestCombo >= 2 && (
              <div
                data-testid="hud-combo-badge"
                className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#78350f] border border-[#f59e0b] text-[10px] sm:text-xs font-bold text-[#fde047]"
              >
                <Flame className="w-3 h-3 text-[#fb923c]" />
                <span>x{harvestCombo}</span>
              </div>
            )}
          </div>

          {/* Top-Right: Season, Day, Time, Weather & Utility Buttons */}
          <div className="flex flex-col items-end gap-1.5 sm:gap-2 min-w-0">
            <div className="wood-panel rounded-lg px-2 sm:px-3.5 [@media(max-height:500px)]:px-2.5 py-1.5 sm:py-2 [@media(max-height:500px)]:py-1.5 pointer-events-auto flex flex-col sm:flex-row items-end sm:items-center gap-1.5 sm:gap-2.5">
              <div className="text-right shrink-0" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <div className="font-display font-bold text-xs sm:text-base [@media(max-height:500px)]:text-sm text-[#fdf3dc] leading-tight whitespace-nowrap" data-testid="hud-day">
                  {translateSeason(hud.season, lang)} · {t.dayWord} {hud.dayOfSeason}
                </div>
                <div className="flex items-center justify-end gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-[#d6c2a3] font-mono-tabular whitespace-nowrap">
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <TimeIcon phase={hud.timePhase} className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span>{formatTimeLocalized(hud.timeMinutes, lang)}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1 whitespace-nowrap" data-testid="hud-weather">
                    <WeatherIcon weather={hud.weather} className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span>{translateWeather(hud.weather, lang)}</span>
                  </span>
                </div>
              </div>

              <div className="hidden sm:block h-7 w-px bg-[#6b482e]" aria-hidden="true" />

              <div className="flex items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onOpenMissions();
                  }}
                  aria-label={lang === 'ar' ? 'فتح التحديات' : 'Open Farmer Missions (J)'}
                  title={`${t.missions} (J)`}
                  className={`relative p-1 sm:px-2.5 sm:py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                    hud.claimableMissions > 0 ? 'wood-button-primary' : 'wood-button'
                  }`}
                >
                  <Trophy className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.missions}</span>
                  {hud.claimableMissions > 0 && (
                    <span className="px-1 min-w-[15px] h-4 rounded-full bg-[#f7d87c] text-[#24170f] text-[10px] font-mono-tabular font-bold flex items-center justify-center">
                      {hud.claimableMissions}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onOpenShop();
                  }}
                  aria-label={lang === 'ar' ? 'فتح سوق القرية' : 'Open Village Shop (B)'}
                  title={`${t.shop} (B)`}
                  className="wood-button p-1 sm:px-2.5 sm:py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.shop}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onOpenCraft();
                  }}
                  aria-label={lang === 'ar' ? 'فتح التصنيع والحقيبة' : 'Open Craft & Satchel (C)'}
                  title={`${t.craft} (C)`}
                  className="wood-button p-1 sm:px-2.5 sm:py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Hammer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.craft}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onOpenNasa();
                  }}
                  aria-label={lang === 'ar' ? 'فتح مرصد ناسا' : 'Open NASA Observatory (N)'}
                  title={`${t.nasaBtn} (N)`}
                  className="wood-button p-1 sm:px-2.5 sm:py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Satellite className="w-3.5 h-3.5 text-[#7dd3fc]" />
                  <span className="hidden sm:inline">{t.nasaBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onOpenAlmanac();
                  }}
                  aria-label={lang === 'ar' ? 'فتح الموسوعة والمستوى' : 'Open Almanac & Level (L)'}
                  title={`${t.almanacBtn} (L)`}
                  className="wood-button p-1 sm:px-2.5 sm:py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#fde047]" />
                  <span className="hidden sm:inline">{t.almanacBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSleepNow();
                  }}
                  aria-label={lang === 'ar' ? 'الراحة في المنزل لبداية يوم جديد' : 'Rest at Farmhouse to Next Day'}
                  title={t.rest}
                  className="wood-button p-1 sm:p-1.5 rounded cursor-pointer shrink-0"
                >
                  <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                {onToggleSprint && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onToggleSprint();
                    }}
                    aria-pressed={sprintActive}
                    aria-label={t.sprintBtn}
                    title={t.sprintBtn}
                    className={`p-1 sm:p-1.5 rounded cursor-pointer shrink-0 ${
                      sprintActive ? 'wood-button-primary ring-1 ring-[#fde047]' : 'wood-button'
                    }`}
                  >
                    <Zap className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${sprintActive ? 'text-[#fde047]' : ''}`} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleMute();
                  }}
                  aria-label={
                    lang === 'ar'
                      ? muted
                        ? 'تشغيل الصوت'
                        : 'كتم الصوت'
                      : muted
                      ? 'Unmute Audio (M)'
                      : 'Mute Audio (M)'
                  }
                  title={lang === 'ar' ? 'تشغيل أو كتم الصوت' : 'Mute / Unmute (M)'}
                  className="wood-button p-1 sm:p-1.5 rounded cursor-pointer shrink-0"
                >
                  {muted ? <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleTouchControls();
                  }}
                  aria-label={
                    lang === 'ar'
                      ? touchControlsEnabled
                        ? 'إخفاء أزرار الهاتف'
                        : 'إظهار أزرار الهاتف'
                      : touchControlsEnabled
                      ? 'Hide On-Screen Buttons'
                      : 'Show On-Screen Buttons'
                  }
                  title={t.touchControlsLabel}
                  className={`hidden sm:inline-flex p-1.5 rounded cursor-pointer shrink-0 ${
                    touchControlsEnabled ? 'wood-button-primary' : 'wood-button'
                  }`}
                >
                  <Gamepad2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleBlindMode();
                  }}
                  aria-pressed={blindMode}
                  aria-label={blindMode ? t.blindModeOn : t.blindModeOff}
                  title={`${t.blindModeBtn} (V)`}
                  className={`p-1 sm:p-1.5 rounded cursor-pointer shrink-0 ${
                    blindMode ? 'wood-button-primary ring-1 ring-[#f7d87c]' : 'wood-button'
                  }`}
                >
                  <AudioLines className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleFullscreen();
                  }}
                  aria-label={isFullscreen ? t.exitFullscreenBtn : t.fullscreenBtn}
                  title={isFullscreen ? t.exitFullscreenBtn : t.fullscreenBtn}
                  className="wood-button p-1 sm:p-1.5 rounded cursor-pointer shrink-0"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onPause();
                  }}
                  aria-label={lang === 'ar' ? 'إيقاف اللعبة مؤقتاً' : 'Pause Game (Esc)'}
                  title={lang === 'ar' ? 'إيقاف مؤقت' : 'Pause (Esc)'}
                  className="wood-button p-1 sm:p-1.5 rounded cursor-pointer shrink-0"
                >
                  <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            </div>

            {dailyOrderReady && (
              <button
                type="button"
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                onClick={onOpenShop}
                className="wood-button-primary rounded-md px-2.5 py-1 text-[11px] sm:text-xs font-bold pointer-events-auto cursor-pointer flex items-center gap-1.5"
              >
                <PackageCheck className="w-3.5 h-3.5 text-[#fde047]" />
                <span>{t.orderReadyHud}</span>
              </button>
            )}

            {hud.nightWarning && (
              <div
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                className="wood-panel rounded-md px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-[#ff9f87] pointer-events-auto"
              >
                {t.nightWarning}
              </div>
            )}

            {roomHud && (
              <div
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                className="wood-panel rounded-lg px-2.5 py-1.5 pointer-events-auto flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs"
              >
                <span className="inline-flex items-center gap-1 font-bold text-[#7dd3fc]">
                  <Users className="w-3.5 h-3.5" />
                  <span>{roomHud.players.length}/4</span>
                </span>
                <span className="font-mono-tabular font-bold text-[#fde047] bg-[#24170f] px-1.5 py-0.5 rounded border border-[#6b482e]" data-testid="hud-room-code">
                  {roomHud.roomCode}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyRoomCode()}
                  title={t.copyCodeBtn}
                  className="wood-button px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3 h-3 text-[#4ade80]" /> : <Copy className="w-3 h-3" />}
                  <span className="hidden sm:inline">{copiedCode ? t.codeCopiedToast : t.copyCodeBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyInviteLink()}
                  title={t.copyLinkBtn}
                  className="wood-button px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3 h-3 text-[#4ade80]" /> : <Link2 className="w-3 h-3 text-[#7dd3fc]" />}
                  <span className="hidden md:inline">{copiedLink ? t.linkCopiedToast : t.copyLinkBtn}</span>
                </button>
                {onJoinOrToggleVoiceMic && (
                  voiceLocal?.enabled ? (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        data-testid="voice-mic-btn"
                        onClick={onJoinOrToggleVoiceMic}
                        title={voiceLocal.muted ? t.voiceMicOffBtn : t.voiceMicOnBtn}
                        aria-label={voiceLocal.muted ? t.voiceMicOffBtn : t.voiceMicOnBtn}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-all ${
                          voiceLocal.muted
                            ? 'bg-[#7f1d1d] border border-[#f87171] text-[#fecaca]'
                            : voiceLocal.speaking
                            ? 'bg-[#166534] border border-[#4ade80] text-white ring-2 ring-[#4ade80]/70'
                            : 'wood-button-primary'
                        }`}
                      >
                        {voiceLocal.muted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                        <span className="hidden sm:inline">
                          {voiceLocal.muted ? t.voiceMutedLabel : voiceLocal.speaking ? t.voiceSpeakingLabel : t.voiceActiveLabel}
                        </span>
                      </button>
                      {onToggleVoiceDeafen && (
                        <button
                          type="button"
                          data-testid="voice-deafen-btn"
                          onClick={onToggleVoiceDeafen}
                          title={voiceLocal.deafened ? t.voiceUndeafenBtn : t.voiceDeafenBtn}
                          aria-label={voiceLocal.deafened ? t.voiceUndeafenBtn : t.voiceDeafenBtn}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center cursor-pointer ${
                            voiceLocal.deafened
                              ? 'bg-[#7f1d1d] border border-[#f87171] text-[#fecaca]'
                              : 'wood-button'
                          }`}
                        >
                          {voiceLocal.deafened ? <VolumeX className="w-3 h-3" /> : <Headphones className="w-3 h-3 text-[#86efac]" />}
                        </button>
                      )}
                      {onLeaveVoice && (
                        <button
                          type="button"
                          data-testid="voice-leave-btn"
                          onClick={onLeaveVoice}
                          title={t.voiceLeaveBtn}
                          aria-label={t.voiceLeaveBtn}
                          className="wood-button px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center text-[#fca5a5] cursor-pointer"
                        >
                          <PhoneOff className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-testid="voice-join-btn"
                      onClick={onJoinOrToggleVoiceMic}
                      title={t.voiceJoinBtn}
                      aria-label={t.voiceJoinBtn}
                      className="wood-button px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer text-[#86efac]"
                    >
                      <Mic className="w-3 h-3" />
                      <span className="hidden sm:inline">{t.voiceJoinBtn}</span>
                    </button>
                  )
                )}
                {onToggleChat && (
                  <button
                    type="button"
                    onClick={onToggleChat}
                    title={t.chatBtn}
                    className={`relative px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      chatOpen ? 'wood-button-primary' : 'wood-button'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span className="hidden sm:inline">{t.chatBtn}</span>
                    {unreadChatCount > 0 && !chatOpen && (
                      <span className="px-1 min-w-[14px] h-3.5 rounded-full bg-[#ef4444] text-white text-[9px] font-mono-tabular font-bold flex items-center justify-center">
                        {unreadChatCount > 9 ? '9+' : unreadChatCount}
                      </span>
                    )}
                  </button>
                )}
                {onLeaveRoom && (
                  <button
                    type="button"
                    onClick={onLeaveRoom}
                    title={t.leaveRoomBtn}
                    className="wood-button px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 text-[#fca5a5] cursor-pointer"
                  >
                    <LogOut className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {roomHud && voiceLocal?.notice && (
              <div
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                className="wood-panel rounded-md px-2.5 py-1 text-[11px] font-semibold text-[#fde047] pointer-events-auto flex items-center gap-2"
              >
                <span>{voiceLocal.notice}</span>
                {onDismissVoiceNotice && (
                  <button
                    type="button"
                    onClick={onDismissVoiceNotice}
                    className="text-[#fdf3dc]/70 hover:text-white cursor-pointer"
                    aria-label={t.cancel}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {roomHud && roomHud.reconnecting && (
          <div
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            className="self-center wood-panel rounded-md px-3 py-1 text-xs font-bold text-[#fde047]"
          >
            {t.reconnectingToast}
          </div>
        )}

        {roomHud && roomHud.sleepVotes.length > 0 && roomHud.players.length > 1 && (
          <div
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            className="self-center pointer-events-auto wood-panel rounded-lg px-3 py-1.5 text-xs font-semibold text-[#bae6fd] flex flex-wrap items-center gap-2"
          >
            <Moon className="w-3.5 h-3.5 text-[#fde047]" />
            <span>
              {t.sleepVoteReady
                .replace('{ready}', String(roomHud.sleepVotes.length))
                .replace('{total}', String(roomHud.players.length))}
            </span>
            <span className="text-[#d6c2a3]">
              ·{' '}
              {t.sleepVoteWaiting.replace(
                '{left}',
                String(Math.max(0, roomHud.players.length - roomHud.sleepVotes.length))
              )}
            </span>
            {onToggleSleepVote && (
              <button
                type="button"
                onClick={onToggleSleepVote}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                  roomHud.sleepVotes.includes(roomHud.playerId)
                    ? 'wood-button text-[#fca5a5]'
                    : 'wood-button-primary'
                }`}
              >
                {roomHud.sleepVotes.includes(roomHud.playerId) ? t.sleepCancelBtn : t.sleepReadyBtn}
              </button>
            )}
          </div>
        )}

        {roomHud && chatOpen && (
          <div
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            className="self-end pointer-events-auto wood-panel rounded-xl p-2.5 w-64 sm:w-72 space-y-2 shadow-xl"
          >
            <div className="flex flex-wrap gap-1 border-b border-[#6b482e] pb-1.5">
              {roomHud.players.map((rp) => {
                const pal = PLAYER_PALETTE[rp.colorIndex % PLAYER_PALETTE.length] ?? PLAYER_PALETTE[0];
                const isSelf = rp.id === roomHud.playerId;
                const vs = isSelf
                  ? voiceLocal?.enabled
                    ? {
                        enabled: true,
                        muted: voiceLocal.muted,
                        speaking: voiceLocal.speaking,
                      }
                    : undefined
                  : roomHud.voiceStates[rp.id];
                const peerLocallyMuted = !isSelf && Boolean(voiceLocal?.locallyMutedPeers.includes(rp.id));
                return (
                  <span
                    key={rp.id}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#24170f] border text-[10px] font-bold text-[#fdf3dc] ${
                      vs?.enabled && vs.speaking ? 'border-[#4ade80] ring-1 ring-[#4ade80]/60' : 'border-[#593c26]'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: pal.badge }}
                    />
                    <span>{rp.name}</span>
                    {rp.id === roomHud.hostId && <span className="text-[#fde047]">★</span>}
                    {vs?.enabled && (
                      vs.muted ? (
                        <MicOff className="w-2.5 h-2.5 text-[#fca5a5]" />
                      ) : (
                        <Mic className={`w-2.5 h-2.5 ${vs.speaking ? 'text-[#4ade80] animate-pulse' : 'text-[#86efac]'}`} />
                      )
                    )}
                    {!isSelf && voiceLocal?.enabled && vs?.enabled && onTogglePeerVoiceMute && (
                      <button
                        type="button"
                        onClick={() => onTogglePeerVoiceMute(rp.id)}
                        title={peerLocallyMuted ? t.voiceUnmutePeerBtn : t.voiceMutePeerBtn}
                        aria-label={peerLocallyMuted ? t.voiceUnmutePeerBtn : t.voiceMutePeerBtn}
                        className="ml-0.5 text-[#fdf3dc]/70 hover:text-white cursor-pointer"
                      >
                        {peerLocallyMuted ? (
                          <VolumeX className="w-2.5 h-2.5 text-[#fca5a5]" />
                        ) : (
                          <Volume2 className="w-2.5 h-2.5 text-[#86efac]" />
                        )}
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1 text-xs pr-1">
              {roomHud.chat.length === 0 ? (
                <div className="text-[11px] text-[#bfa688] italic py-1">{t.noChatYet}</div>
              ) : (
                roomHud.chat.map((msg) => {
                  const pal = PLAYER_PALETTE[msg.colorIndex % PLAYER_PALETTE.length] ?? PLAYER_PALETTE[0];
                  return (
                    <div key={msg.id} className="leading-snug break-words">
                      <span className="font-bold" style={{ color: pal.badge }}>
                        {msg.senderName}:{' '}
                      </span>
                      <span className="text-[#f5ebd6]">{msg.text}</span>
                    </div>
                  );
                })
              )}
            </div>
            <form onSubmit={handleChatSubmit} className="flex gap-1.5">
              <input
                ref={chatInputRef}
                type="text"
                maxLength={140}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={t.chatPlaceholder}
                className="flex-1 min-w-0 px-2 py-1 rounded bg-[#1b120b] border border-[#6b482e] text-xs text-[#fdf3dc] focus:outline-none focus:border-[#f7d87c]"
              />
              <button
                type="submit"
                className="wood-button-primary px-2 py-1 rounded text-xs font-bold cursor-pointer shrink-0"
                aria-label={t.sendChatBtn}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}

        {/* Blind Accessibility Live Caption & Quick-Assist Controls (docked cleanly under top bar) */}
        {blindMode && (
          <div
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            className="self-center pointer-events-auto bg-[#18120c]/95 border-2 border-[#f7d87c] rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 max-w-[min(94vw,700px)] shadow-lg"
          >
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onBlindScan();
                }}
                aria-label={t.blindScanBtn}
                className="wood-button-primary px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Eye className="w-3 h-3 shrink-0" />
                <span>{t.blindScanBtn}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onBlindGuide();
                }}
                aria-label={t.blindGuideBtn}
                className="wood-button px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Compass className="w-3 h-3 shrink-0" />
                <span>{t.blindGuideBtn}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onBlindStatus();
                }}
                aria-label={t.blindStatusBtn}
                className="wood-button px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <AudioLines className="w-3 h-3 shrink-0" />
                <span>{t.blindStatusBtn}</span>
              </button>
            </div>
            <div
              role="status"
              aria-live="assertive"
              data-testid="blind-caption-bar"
              className="text-[11px] sm:text-xs font-semibold text-[#fdf3dc] leading-snug text-center sm:text-start"
            >
              {blindCaption || t.blindModeOn}
            </div>
          </div>
        )}

        {/* Morning Report Toast (non-blocking) */}
        {morningSummary && (
          <div
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            className="self-center pointer-events-auto wood-panel rounded-lg px-4 py-2 flex items-center gap-4 max-w-md"
          >
            <div>
              <div className="font-display font-bold text-sm text-[#f7d87c]">
                {translateSeason(morningSummary.season, lang)} {t.dayWord} {((morningSummary.day - 1) % 8) + 1} ·{' '}
                {translateWeather(morningSummary.weather, lang)}
              </div>
              <div className="text-xs text-[#f2e4c9]">{formatMorningSummaryText(morningSummary, lang)}</div>
              {morningSummary.hasNasaStation && (
                <div
                  data-testid="nasa-station-morning-report"
                  className="mt-1 text-[11px] font-semibold text-[#9ee0ff] flex flex-wrap items-center gap-2"
                >
                  <span>
                    {t.soilMoistureLabel}: {morningSummary.soilMoisturePct ?? 0}%
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {t.tempLabel}: {morningSummary.tempC ?? 24}°C
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {t.tomorrowLabel}:{' '}
                    {translateWeather(morningSummary.tomorrowWeather ?? morningSummary.weather, lang)}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onDismissSummary}
              aria-label={lang === 'ar' ? 'إغلاق تقرير الصباح' : 'Dismiss morning report'}
              className="wood-button px-2.5 py-1 rounded text-xs cursor-pointer whitespace-nowrap shrink-0"
            >
              {t.ok}
            </button>
          </div>
        )}
      </div>

      {/* Bottom Dock: Contextual Interaction Prompt + 9-Slot Hotbar */}
      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
        {promptText && (
          <button
            type="button"
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            onClick={onTriggerNearPrompt}
            className="wood-button-primary px-3.5 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-semibold pointer-events-auto cursor-pointer whitespace-nowrap hidden sm:inline-flex"
          >
            {promptText}
          </button>
        )}

        <div className="wood-panel rounded-lg p-1.5 sm:p-2 pointer-events-auto flex flex-col items-center gap-1 sm:gap-1.5 max-w-[calc(100vw-16px)]">
          <div
            className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto max-w-full"
            role="toolbar"
            aria-label={lang === 'ar' ? 'شريط الأدوات والعناصر' : 'Tool and Item Hotbar'}
          >
            {hud.hotbar.map((itemId, idx) => {
              const selected = idx === hud.selectedHotbarIndex;
              const count = itemId ? hud.inventory[itemId] ?? 0 : 0;
              const def = itemId ? ITEMS[itemId] : null;
              const label = itemId ? getItemLabel(itemId, lang) : null;
              const isCan = itemId === 'watering_can';

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSelectHotbar(idx);
                  }}
                  aria-label={
                    lang === 'ar'
                      ? label
                        ? `خانة ${idx + 1}: ${label.name}`
                        : `خانة فارغة ${idx + 1}`
                      : label
                      ? `Slot ${idx + 1}: ${label.name}`
                      : `Empty Slot ${idx + 1}`
                  }
                  className={`relative w-9 h-10 sm:w-12 sm:h-12 [@media(max-height:500px)]:w-9 [@media(max-height:500px)]:h-9 shrink-0 rounded flex items-center justify-center cursor-pointer transition-transform ${
                    selected
                      ? 'bg-[#634128] border-2 border-[#f7d87c] -translate-y-0.5'
                      : 'bg-[#2b1c12] border border-[#5e3f27] hover:bg-[#3c2719]'
                  }`}
                >
                  <span className="hidden sm:inline absolute top-0.5 left-1 text-[10px] font-mono-tabular text-[#bfa688]">
                    {idx + 1}
                  </span>
                  {itemId && <ItemIcon id={itemId} className="w-6 h-6 sm:w-7 sm:h-7" />}
                  {itemId && def?.category !== 'tool' && count > 0 && (
                    <span className="absolute bottom-0 right-1 text-[10px] sm:text-[11px] font-mono-tabular font-bold text-[#fdf3dc]">
                      {count}
                    </span>
                  )}
                  {isCan && (
                    <div className="absolute bottom-1 left-1 right-1 h-1 bg-[#1b120b] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#5cb6eb]"
                        style={{
                          width: `${Math.round((hud.waterLevel / hud.maxWaterLevel) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            className="text-[11px] sm:text-xs text-[#e6d5b8] flex items-center gap-1.5 sm:gap-2 min-h-[16px] whitespace-nowrap overflow-hidden max-w-full"
          >
            {activeLabel && activeItem ? (
              <>
                <span className="font-semibold text-[#fdf3dc] truncate">{activeLabel.name}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{activeLabel.roleClue}</span>
                {activeItem.id === 'watering_can' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular text-[#89cff5] shrink-0">
                      {hud.waterLevel}/{hud.maxWaterLevel}
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="text-[#9e866a]">{t.emptySlot}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
