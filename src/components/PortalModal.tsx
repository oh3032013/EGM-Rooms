import { useEffect } from 'react';
import { CheckCircle2, Compass, Lock, Sparkles, Trees, Sun, Cloud, Home, X } from 'lucide-react';
import { REALM_DEFS, REALM_ORDER } from '../game/constants';
import { getItemLabel, getRealmLabel, MISSION_TEXT, UI_TEXT, type Language } from '../game/i18n';
import { getMissingRealmMissions } from '../game/rules';
import { CREATURE_LABELS, REALM_STORIES, resolveStoryLang } from '../game/story';
import type { GameWorldState, RealmId } from '../game/types';
import { CoinIcon, ItemIcon } from './PixelIcons';

interface PortalModalProps {
  world: GameWorldState;
  lang: Language;
  onUnlockRealm: (id: RealmId) => void;
  onTravelRealm: (id: RealmId) => void;
  onClose: () => void;
}

function RealmIcon({ id, className }: { id: RealmId; className?: string }) {
  if (id === 'whispering_woods') return <Trees className={className} />;
  if (id === 'crystal_oasis') return <Sun className={className} />;
  if (id === 'sky_sanctuary') return <Cloud className={className} />;
  return <Home className={className} />;
}

export function PortalModal({
  world,
  lang,
  onUnlockRealm,
  onTravelRealm,
  onClose,
}: PortalModalProps) {
  const t = UI_TEXT[lang];
  const sLang = resolveStoryLang(lang);
  const isAr = sLang === 'ar';
  const activeRealm: RealmId = world.activeRealm ?? 'homestead';
  const unlockedSet = new Set<RealmId>(world.unlockedRealms ?? ['homestead']);
  unlockedSet.add('homestead');

  const gold = world.player.gold ?? 0;
  const wood = world.inventory.wood ?? 0;
  const stone = world.inventory.stone ?? 0;
  const woodName = getItemLabel('wood', lang).name;
  const stoneName = getItemLabel('stone', lang).name;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center safe-area-modal bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={t.portalModalTitle}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="parchment-panel rounded-xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 sm:py-3.5 border-b-2 border-[#c9b086] bg-[#ebd8b5] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#5b348b] text-[#f3e8ff] flex items-center justify-center border border-[#3b1f63] shrink-0">
              <Compass className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-2xl font-bold text-[#2c1e14] truncate">
                {t.portalModalTitle}
              </h2>
              <p className="text-xs text-[#694d36] truncate">{t.portalModalSub}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="font-mono-tabular text-xs font-bold px-2.5 py-1 rounded bg-[#f9eed8] border border-[#c9b086] text-[#4a3322] whitespace-nowrap">
              {unlockedSet.size}/{REALM_ORDER.length} {t.unlockedLabel}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={lang === 'ar' ? 'إغلاق بوابات العوالم' : 'Close World Portals'}
              className="wood-button p-1.5 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Resource Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-2 bg-[#f5e7cc] border-b border-[#d6be96] text-xs font-mono-tabular text-[#4a3322] shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1 font-bold text-[#8a5708]">
              <CoinIcon className="w-3.5 h-3.5" />
              {gold}g
            </span>
            <span className="inline-flex items-center gap-1 font-semibold">
              <ItemIcon id="wood" className="w-4 h-4" />
              {wood} {woodName}
            </span>
            <span className="inline-flex items-center gap-1 font-semibold">
              <ItemIcon id="stone" className="w-4 h-4" />
              {stone} {stoneName}
            </span>
          </div>
          <span className="text-[11px] font-sans text-[#694d36]">
            {getRealmLabel(activeRealm, lang).name} ({REALM_DEFS[activeRealm].width}×{REALM_DEFS[activeRealm].height})
          </span>
        </div>

        {/* Realm Grid */}
        <div className="flex-1 overflow-y-auto modal-scroll p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {REALM_ORDER.map((id) => {
              const def = REALM_DEFS[id];
              const copy = getRealmLabel(id, lang);
              const story = REALM_STORIES[id];
              const unlocked = unlockedSet.has(id);
              const isCurrent = activeRealm === id;
              const hasResources =
                gold >= def.unlockGold &&
                wood >= def.unlockWood &&
                stone >= def.unlockStone;
              const missingMissions = unlocked ? [] : getMissingRealmMissions(world, id);
              const missingSet = new Set(missingMissions);
              const canUnlock = hasResources && missingMissions.length === 0;

              return (
                <div
                  key={id}
                  data-testid={`realm-card-${id}`}
                  className={`p-3.5 rounded-lg border flex flex-col justify-between gap-3 transition-colors ${
                    isCurrent
                      ? 'bg-[#fef6dc] border-[#9333ea] ring-1 ring-[#c084fc]/60'
                      : unlocked
                      ? 'bg-[#fbf2e1] border-[#b79a6b]'
                      : 'bg-[#efe1c4]/85 border-[#cbb48d]'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center border border-black/15 shrink-0"
                          style={{ backgroundColor: `${def.accentColor}26`, color: '#2c1e14' }}
                        >
                          <RealmIcon id={id} className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-display font-bold text-sm sm:text-base text-[#2c1e14] truncate">
                            {copy.name}
                          </h3>
                          <span className="text-[10px] font-mono-tabular text-[#694d36]">
                            {story.chapterLabel[sLang]} · {def.width}×{def.height}
                          </span>
                        </div>
                      </div>

                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#6b21a8] text-[#faf5ff] text-[10px] font-bold whitespace-nowrap shrink-0">
                          <Sparkles className="w-3 h-3" />
                          {t.currentRealmBadge}
                        </span>
                      ) : unlocked ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#3d7a47] text-white text-[10px] font-bold whitespace-nowrap shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          {t.unlockedLabel}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#d8c39b] text-[#5c4028] text-[10px] font-bold whitespace-nowrap shrink-0">
                          <Lock className="w-3 h-3" />
                          {t.lockedLabel}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#5c4028] leading-relaxed">{copy.desc}</p>

                    <div className="text-[11px] text-[#4a3322] space-y-0.5">
                      <div>
                        <span className="font-semibold">{isAr ? 'القرية:' : 'Village:'}</span>{' '}
                        {story.villageName[sLang]}
                      </div>
                      <div>
                        <span className="font-semibold">{isAr ? 'المنطقة الغريبة:' : 'Strange Zone:'}</span>{' '}
                        {story.strangeZoneName[sLang]}
                      </div>
                      {story.nativeCreatures.length > 0 && (
                        <div>
                          <span className="font-semibold">{isAr ? 'الحيوانات:' : 'Wildlife:'}</span>{' '}
                          {story.nativeCreatures.map((k) => CREATURE_LABELS[k][sLang]).join(' · ')}
                        </div>
                      )}
                    </div>

                    <div className="px-2.5 py-1.5 rounded bg-[#f4e4c4] border border-[#d6be96] text-[11px] font-semibold text-[#3f2a1d] flex items-center gap-1.5">
                      <span>{copy.perk}</span>
                    </div>

                    {!unlocked && def.requiredMissions.length > 0 && (
                      <div
                        data-testid={`realm-missions-${id}`}
                        className="p-2 rounded bg-[#e8d5b2] border border-[#c9b086] space-y-1 text-[11px]"
                      >
                        <div className="font-bold text-[#3f2a1d]">
                          {isAr ? 'المهام المطلوبة لفتح العالم:' : 'Required Missions to Unlock:'}
                        </div>
                        {def.requiredMissions.map((mid) => {
                          const done = !missingSet.has(mid);
                          const mTitle = MISSION_TEXT[mid]?.[lang]?.title ?? mid;
                          return (
                            <div
                              key={mid}
                              className={`flex items-center gap-1.5 ${
                                done ? 'text-[#2f6e3a] font-semibold' : 'text-[#7c2d12]'
                              }`}
                            >
                              {done ? (
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                              ) : (
                                <Lock className="w-3 h-3 shrink-0" />
                              )}
                              <span className="truncate">{mTitle}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Cost & Action */}
                  <div className="pt-1 border-t border-[#dcc6a0] flex items-center justify-between gap-2">
                    {!unlocked ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular">
                          {def.unlockGold > 0 && (
                            <span
                              className={`inline-flex items-center gap-1 font-bold ${
                                gold >= def.unlockGold ? 'text-[#8a5708]' : 'text-[#b91c1c]'
                              }`}
                            >
                              <CoinIcon className="w-3.5 h-3.5" />
                              {def.unlockGold}g
                            </span>
                          )}
                          {def.unlockWood > 0 && (
                            <span
                              className={`inline-flex items-center gap-1 font-bold ${
                                wood >= def.unlockWood ? 'text-[#5c4028]' : 'text-[#b91c1c]'
                              }`}
                            >
                              <ItemIcon id="wood" className="w-3.5 h-3.5" />
                              {def.unlockWood}
                            </span>
                          )}
                          {def.unlockStone > 0 && (
                            <span
                              className={`inline-flex items-center gap-1 font-bold ${
                                stone >= def.unlockStone ? 'text-[#475569]' : 'text-[#b91c1c]'
                              }`}
                            >
                              <ItemIcon id="stone" className="w-3.5 h-3.5" />
                              {def.unlockStone}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!canUnlock}
                          onClick={() => onUnlockRealm(id)}
                          data-testid={`unlock-realm-${id}`}
                          className="wood-button-primary px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
                        >
                          {missingMissions.length > 0
                            ? isAr
                              ? 'أتمم المهام أولاً'
                              : 'Complete Missions'
                            : t.unlockRealmBtn}
                        </button>
                      </>
                    ) : (
                      <div className="w-full flex justify-end">
                        <button
                          type="button"
                          disabled={isCurrent}
                          onClick={() => onTravelRealm(id)}
                          data-testid={`travel-realm-${id}`}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
                            isCurrent
                              ? 'bg-[#dfd0b1] text-[#694d36] border border-[#c9b086] cursor-default'
                              : 'wood-button-primary cursor-pointer'
                          }`}
                        >
                          {isCurrent ? t.currentRealmBadge : t.travelBtn}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
