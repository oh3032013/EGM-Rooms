import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Compass,
  Flag,
  Lock,
  MapPin,
  PawPrint,
  ScrollText,
  Sparkles,
  Square,
  UserCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { REALM_DEFS, REALM_ORDER } from '../game/constants';
import { getRealmLabel, type Language } from '../game/i18n';
import {
  buildOriginNarrationLines,
  buildRealmNarrationLines,
  CREATURE_LABELS,
  ORIGIN_STORY,
  REALM_STORIES,
  resolveStoryLang,
} from '../game/story';
import {
  getStoryAutoVoicePreference,
  saveStoryAutoVoicePreference,
  startStoryNarration,
  stopStoryNarration,
  subscribeStoryNarration,
  type StoryNarrationSnapshot,
} from '../game/storyNarration';
import type { GameWorldState, RealmId } from '../game/types';

export type StoryTabId = 'origin' | RealmId;

export interface StoryFocus {
  realmId: RealmId;
  tab?: StoryTabId;
  encounter?: 'elder' | 'strange_zone';
  isPrologue?: boolean;
}

interface StoryModalProps {
  world: GameWorldState;
  lang: Language;
  focus?: StoryFocus | null;
  onOpenPortals?: () => void;
  onOpenMissions?: () => void;
  onClose: () => void;
}

export function StoryModal({
  world,
  lang,
  focus,
  onOpenPortals,
  onOpenMissions,
  onClose,
}: StoryModalProps) {
  const sLang = resolveStoryLang(lang);
  const isAr = sLang === 'ar';
  const initialTab: StoryTabId =
    focus?.tab ?? (focus?.encounter ? focus.realmId : world.activeRealm ?? 'origin');
  const [selectedTab, setSelectedTab] = useState<StoryTabId>(initialTab);
  const [autoVoice, setAutoVoice] = useState<boolean>(() => getStoryAutoVoicePreference());
  const [voiceSnap, setVoiceSnap] = useState<StoryNarrationSnapshot>({
    speaking: false,
    supported: true,
    lineIndex: -1,
    totalLines: 0,
    currentLine: '',
  });
  const autoPlayedRef = useRef<string | null>(null);

  const unlockedRealms = new Set<RealmId>(world.unlockedRealms ?? ['homestead']);
  unlockedRealms.add('homestead');
  const visitedVillages = new Set<RealmId>(world.visitedVillages ?? []);
  const investigatedZones = new Set<RealmId>(world.investigatedStrangeZones ?? []);
  const elderGifted = new Set<RealmId>(world.elderGiftsToday ?? []);
  const zoneUsedToday = new Set<RealmId>(world.strangeZoneUsedToday ?? []);

  useEffect(() => {
    const unsub = subscribeStoryNarration(setVoiceSnap);
    return () => {
      unsub();
      stopStoryNarration();
    };
  }, []);

  useEffect(() => {
    setSelectedTab(
      focus?.tab ?? (focus?.encounter ? focus.realmId : world.activeRealm ?? 'origin')
    );
  }, [focus, world.activeRealm]);

  const currentLines = useMemo(() => {
    if (selectedTab === 'origin') {
      return buildOriginNarrationLines(lang);
    }
    const encounterForTab =
      focus?.realmId === selectedTab ? focus.encounter : undefined;
    return buildRealmNarrationLines(selectedTab, lang, encounterForTab);
  }, [selectedTab, lang, focus]);

  const handleToggleVoice = useCallback(() => {
    if (voiceSnap.speaking) {
      stopStoryNarration();
    } else {
      startStoryNarration(currentLines, lang, { withChime: true });
    }
  }, [voiceSnap.speaking, currentLines, lang]);

  // Auto-narrate when opening the Origin Prologue or a Village Elder / Strange Zone encounter
  useEffect(() => {
    const shouldAutoSpeak = Boolean(focus?.isPrologue || focus?.encounter);
    if (!shouldAutoSpeak || !autoVoice) return;
    const key = `${selectedTab}:${focus?.encounter ?? ''}:${focus?.isPrologue ? '1' : '0'}`;
    if (autoPlayedRef.current === key) return;
    autoPlayedRef.current = key;
    startStoryNarration(currentLines, lang, { withChime: true });
  }, [autoVoice, currentLines, focus, lang, selectedTab]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        stopStoryNarration();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleTabSelect = (tab: StoryTabId) => {
    if (voiceSnap.speaking) {
      stopStoryNarration();
    }
    setSelectedTab(tab);
  };

  const selectedRealm: RealmId = selectedTab === 'origin' ? 'homestead' : selectedTab;
  const story = REALM_STORIES[selectedRealm];
  const realmDef = REALM_DEFS[selectedRealm];
  const realmCopy = getRealmLabel(selectedRealm, lang);
  const isUnlocked = unlockedRealms.has(selectedRealm);
  const villageDone = visitedVillages.has(selectedRealm);
  const zoneDone = investigatedZones.has(selectedRealm);
  const encounterKind = focus?.realmId === selectedRealm ? focus.encounter : undefined;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center safe-area-modal bg-black/65"
      role="dialog"
      aria-modal="true"
      aria-label={isAr ? 'سجل القصة والعوالم والقرى' : 'Story Chronicle & Realm Lore'}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopStoryNarration();
          onClose();
        }
      }}
    >
      <div className="parchment-panel rounded-xl w-full max-w-3xl max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 sm:py-3.5 border-b-2 border-[#c9b086] bg-[#ebd8b5] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#6b4423] text-[#fdf3dc] flex items-center justify-center border border-[#422813] shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-2xl font-bold text-[#2c1e14] truncate">
                {isAr ? 'حكاية المزرعة ومهمتك في العوالم' : 'Farm Origin, Mission & Chronicle'}
              </h2>
              <p className="text-xs text-[#694d36] truncate">
                {isAr
                  ? 'اسمع قصة البداية وكيف تستعيد العوالم الأربعة والقرى والمناطق الغريبة'
                  : 'Listen to how the farm began, your mission, and the lore of all four realms'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono-tabular text-xs font-bold text-[#5c4028] whitespace-nowrap">
              {unlockedRealms.size}/{REALM_ORDER.length}
            </span>
            <button
              type="button"
              onClick={() => {
                stopStoryNarration();
                onClose();
              }}
              aria-label={isAr ? 'إغلاق القصة' : 'Close Story'}
              className="wood-button p-1.5 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Voice Narration Bar */}
        <div
          data-testid="story-voice-bar"
          className="px-4 sm:px-5 py-2.5 bg-[#f7ebd3] border-b border-[#d6be96] flex flex-wrap items-center justify-between gap-2 shrink-0"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="story-voice-toggle"
              onClick={handleToggleVoice}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                voiceSnap.speaking ? 'bg-[#9b2c2c] text-[#fff5f5] border border-[#63171b]' : 'wood-button-primary'
              }`}
            >
              {voiceSnap.speaking ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span>{isAr ? 'إيقاف الراوي الصوتي' : 'Stop Voice'}</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 shrink-0" />
                  <span>{isAr ? 'استمع للقصة بالصوت' : 'Listen to Story'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="story-autovoice-toggle"
              aria-pressed={autoVoice}
              onClick={() => {
                const next = !autoVoice;
                setAutoVoice(next);
                saveStoryAutoVoicePreference(next);
                if (!next && voiceSnap.speaking) {
                  stopStoryNarration();
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap border ${
                autoVoice
                  ? 'bg-[#e6f4ea] text-[#1e5631] border-[#66a878]'
                  : 'bg-[#eee0c5] text-[#6d543c] border-[#ccb48a]'
              }`}
            >
              {autoVoice ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{isAr ? 'صوت تلقائي عند الأحداث' : 'Auto-Narrate'}</span>
            </button>
          </div>

          {voiceSnap.speaking && (
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#3d7a47]">
              <span className="inline-flex items-end gap-0.5 h-3" aria-hidden="true">
                <span className="w-0.5 h-2 bg-[#3d7a47] animate-pulse" />
                <span className="w-0.5 h-3 bg-[#3d7a47] animate-pulse" />
                <span className="w-0.5 h-1.5 bg-[#3d7a47] animate-pulse" />
              </span>
              <span>
                {isAr
                  ? `الراوي يتحدث (${voiceSnap.lineIndex + 1}/${voiceSnap.totalLines})`
                  : `Narrating (${voiceSnap.lineIndex + 1}/${voiceSnap.totalLines})`}
              </span>
            </div>
          )}
        </div>

        {/* Active Live Voice Subtitle Strip */}
        {voiceSnap.speaking && voiceSnap.currentLine && (
          <div
            data-testid="story-voice-subtitle"
            aria-live="polite"
            className="px-4 sm:px-5 py-2 bg-[#2b1d12] text-[#fdf3dc] text-xs sm:text-sm font-medium border-b border-[#5b3f28] shrink-0 leading-relaxed"
          >
            “{voiceSnap.currentLine}”
          </div>
        )}

        {/* Tabs: Tab 0 = Origin & Mission + Chapters 1..4 */}
        <div className="flex items-center gap-1.5 px-4 sm:px-5 py-2.5 bg-[#f4e5c8] border-b border-[#d6be96] overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => handleTabSelect('origin')}
            data-testid="story-tab-origin"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
              selectedTab === 'origin'
                ? 'wood-button-primary'
                : 'bg-[#fbf2e1] text-[#3f2a1d] border border-[#c9b086] hover:bg-[#f7e7c6]'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5 shrink-0" />
            <span>{isAr ? '0. البداية والمهمة' : '0. Origin & Mission'}</span>
          </button>

          {REALM_ORDER.map((id) => {
            const st = REALM_STORIES[id];
            const unlocked = unlockedRealms.has(id);
            const active = selectedTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleTabSelect(id)}
                data-testid={`story-tab-${id}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'wood-button-primary'
                    : unlocked
                    ? 'bg-[#fbf2e1] text-[#3f2a1d] border border-[#c9b086] hover:bg-[#f7e7c6]'
                    : 'bg-[#e6d5b6] text-[#6d543c] border border-[#ccb48a]'
                }`}
              >
                {unlocked ? (
                  <Compass className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {st.chapterNumber}. {getRealmLabel(id, lang).name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto modal-scroll p-4 sm:p-5 space-y-4">
          {selectedTab === 'origin' ? (
            <div data-testid="story-origin-panel" className="space-y-4">
              <div>
                <h3 className="font-display text-xl sm:text-2xl font-bold text-[#2c1e14]">
                  {ORIGIN_STORY.title[sLang]}
                </h3>
                <p className="text-xs sm:text-sm text-[#694d36] mt-0.5">
                  {ORIGIN_STORY.subtitle[sLang]}
                </p>
              </div>

              {/* How the Farm Started */}
              <div className="rounded-lg border border-[#d6be96] bg-[#fbf2e1] p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-bold text-[#4a3322]">
                  <ScrollText className="w-4 h-4 text-[#b45309] shrink-0" />
                  <span>{ORIGIN_STORY.howItStartedHeading[sLang]}</span>
                </div>
                <div className="space-y-2 text-xs sm:text-sm text-[#3f2a1d] leading-relaxed">
                  {ORIGIN_STORY.howItStartedParagraphs[sLang].map((para, idx) => (
                    <p key={idx}>{para}</p>
                  ))}
                </div>
              </div>

              {/* What Is Your Mission */}
              <div className="rounded-lg border border-[#b6c9a8] bg-[#eef6e8] p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-[#1e4620]">
                  <Flag className="w-4 h-4 text-[#2f6e3a] shrink-0" />
                  <span>{ORIGIN_STORY.yourMissionHeading[sLang]}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {ORIGIN_STORY.yourMissionSteps.map((step) => (
                    <div
                      key={step.number}
                      className="rounded-lg border border-[#c6dab8] bg-white/75 p-3 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded bg-[#2f6e3a] text-[#fdf3dc] text-xs font-bold flex items-center justify-center shrink-0">
                          {step.number}
                        </span>
                        <h4 className="text-xs font-bold text-[#1e3a20] leading-snug">
                          {step.title[sLang]}
                        </h4>
                      </div>
                      <p className="text-[11px] sm:text-xs text-[#3b4f39] leading-relaxed">
                        {step.detail[sLang]}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="text-xs font-semibold text-[#285e2b] pt-1">
                  {ORIGIN_STORY.closingHook[sLang]}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Active Landmark Encounter Banner */}
              {encounterKind && (
                <div
                  data-testid={`story-encounter-${encounterKind}`}
                  className={`rounded-lg border p-3.5 space-y-1.5 ${
                    encounterKind === 'elder'
                      ? 'bg-[#fef6dc] border-[#c4922c]'
                      : 'bg-[#f3e8ff] border-[#9333ea]'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-[#2c1e14]">
                    {encounterKind === 'elder' ? (
                      <UserCheck className="w-4 h-4 text-[#9a630a]" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-[#6b21a8]" />
                    )}
                    <span>
                      {encounterKind === 'elder'
                        ? `${story.elderName[sLang]} · ${story.elderRole[sLang]}`
                        : story.strangeZoneName[sLang]}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#2c1e14] leading-relaxed">
                    {encounterKind === 'elder'
                      ? story.elderGreeting[sLang]
                      : story.strangeZoneLore[sLang]}
                  </p>
                  <p className="text-xs font-semibold text-[#3d7a47]">
                    {encounterKind === 'elder'
                      ? story.elderBlessingText[sLang]
                      : story.strangeZoneEffect[sLang]}
                  </p>
                </div>
              )}

              {/* Chapter Header & Chronicle */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-[#694d36] flex items-center gap-2">
                    <span>{story.chapterLabel[sLang]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{realmCopy.name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {realmDef.width}×{realmDef.height}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-[#4a3322]">
                    {isUnlocked
                      ? isAr
                        ? 'عالم مفتوح'
                        : 'Realm Unlocked'
                      : isAr
                      ? 'مغلق — أتمم مهام البوابة'
                      : 'Locked — Complete Portal Missions'}
                  </span>
                </div>

                <h3 className="font-display text-xl sm:text-2xl font-bold text-[#2c1e14]">
                  {story.title[sLang]}
                </h3>
                <p className="text-xs sm:text-sm font-medium text-[#5c4028] leading-relaxed">
                  {story.summary[sLang]}
                </p>
                <div className="rounded-lg border border-[#d6be96] bg-[#fbf2e1] p-3.5 text-xs sm:text-sm text-[#3f2a1d] leading-relaxed">
                  {story.chronicle[sLang]}
                </div>
              </div>

              {/* Village & Strange Zone Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-[#d6be96] bg-[#fbf2e1] p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#4a3322]">
                      <MapPin className="w-4 h-4 text-[#b45309]" />
                      <span>{story.villageName[sLang]}</span>
                    </div>
                    {villageDone && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2f6e3a]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isAr ? 'تمت الزيارة' : 'Visited'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#694d36]">
                    <span className="font-semibold text-[#2c1e14]">{story.elderName[sLang]}</span>
                    {' · '}
                    <span>{story.elderRole[sLang]}</span>
                  </div>
                  <p className="text-xs text-[#4a3322] leading-relaxed">{story.elderGreeting[sLang]}</p>
                  <div className="text-[11px] font-medium text-[#694d36]">
                    {elderGifted.has(selectedRealm)
                      ? isAr
                        ? '✓ استلمت هدية الحكيم اليوم'
                        : '✓ Elder blessing received today'
                      : isAr
                      ? 'اقترب من الحكيم في القرية واضغط [E]'
                      : 'Approach the Village Elder and press [E]'}
                  </div>
                </div>

                <div className="rounded-lg border border-[#cbb4dd] bg-[#f8f1ff] p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#4c1d95]">
                      <Sparkles className="w-4 h-4 text-[#7e22ce]" />
                      <span>{story.strangeZoneName[sLang]}</span>
                    </div>
                    {zoneDone && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2f6e3a]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isAr ? 'تم الاستكشاف' : 'Studied'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#3b1f63] leading-relaxed">{story.strangeZoneLore[sLang]}</p>
                  <div className="text-[11px] font-medium text-[#6b21a8]">
                    {zoneUsedToday.has(selectedRealm)
                      ? isAr
                        ? '✓ استُخرجت طاقة المنطقة الغريبة اليوم'
                        : '✓ Anomaly resonance gathered today'
                      : story.strangeZoneEffect[sLang]}
                  </div>
                </div>
              </div>

              {/* Native Animals */}
              <div className="rounded-lg border border-[#d6be96] bg-[#f6e8cc] p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#4a3322]">
                  <PawPrint className="w-4 h-4 text-[#3d7a47]" />
                  <span>{isAr ? 'الحيوانات البرية المميزة لهذا العالم' : 'Native Realm Wildlife'}</span>
                </div>
                {story.nativeCreatures.length > 0 ? (
                  <div className="text-xs text-[#3f2a1d] font-medium">
                    {story.nativeCreatures.map((k) => CREATURE_LABELS[k][sLang]).join(' · ')}
                  </div>
                ) : (
                  <div className="text-xs text-[#694d36]">
                    {isAr
                      ? 'دجاج وأبقار وخراف الوادي مع كلب الحراسة وقط المزرعة.'
                      : 'Homestead chickens, dairy cows, fluffy sheep, guard dog & farm cat.'}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-2.5 border-t border-[#d6be96] bg-[#ebd8b5] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-[#694d36]">
            {isAr
              ? `القرى المزارة: ${visitedVillages.size}/4 · المناطق الغريبة: ${investigatedZones.size}/4`
              : `Villages Visited: ${visitedVillages.size}/4 · Strange Zones Studied: ${investigatedZones.size}/4`}
          </span>
          <div className="flex items-center gap-2">
            {onOpenMissions && (
              <button
                type="button"
                onClick={() => {
                  stopStoryNarration();
                  onClose();
                  onOpenMissions();
                }}
                className="wood-button px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                {isAr ? 'المهام' : 'Missions'}
              </button>
            )}
            {onOpenPortals && (
              <button
                type="button"
                onClick={() => {
                  stopStoryNarration();
                  onClose();
                  onOpenPortals();
                }}
                className="wood-button px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                {isAr ? 'بوابات العوالم' : 'World Portals'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                stopStoryNarration();
                onClose();
              }}
              className="wood-button-primary px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              {focus?.isPrologue
                ? isAr
                  ? 'ابدأ مهمتك الآن!'
                  : 'Begin Your Mission!'
                : isAr
                ? 'متابعة اللعب'
                : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
