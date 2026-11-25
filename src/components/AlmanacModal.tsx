import { useState } from 'react';
import { BookOpen, CheckCircle2, Lock, Sparkles, TrendingUp, X } from 'lucide-react';
import { CROPS, ITEMS } from '../game/constants';
import { getItemLabel, translateSeason, UI_TEXT, type Language } from '../game/i18n';
import { getXpThreshold } from '../game/rules';
import type { CropType, GameWorldState, ItemId } from '../game/types';
import { ItemIcon } from './PixelIcons';

interface AlmanacModalProps {
  world: GameWorldState;
  lang: Language;
  onClose: () => void;
}

const ARTISAN_ITEMS: ItemId[] = [
  'egg',
  'honey',
  'milk',
  'wool',
  'cheese',
  'strawberry_jam',
  'fish',
  'fertilizer',
];

export function AlmanacModal({ world, lang, onClose }: AlmanacModalProps) {
  const [tab, setTab] = useState<'crops' | 'artisan'>('crops');
  const t = UI_TEXT[lang];
  const level = world.level ?? 1;
  const xp = world.xp ?? 0;
  const xpNeed = getXpThreshold(level);
  const xpPct = Math.min(100, Math.round((xp / xpNeed) * 100));
  const discovered = new Set(world.discoveredItems ?? []);
  const surgeCrop = world.marketSurgeCrop ?? 'wheat';
  const surgeLabel = getItemLabel(surgeCrop, lang);
  const cropList = Object.keys(CROPS) as CropType[];

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center safe-area-modal bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label={t.almanacTitle}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="parchment-panel rounded-xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 sm:py-3.5 border-b-2 border-[#c9b086] bg-[#ebd8b5] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#5c4028] text-[#fdf3dc] flex items-center justify-center border border-[#382515] shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-2xl font-bold text-[#2c1e14] truncate">
                {t.almanacTitle}
              </h2>
              <p className="text-xs text-[#694d36] truncate">{t.almanacSub}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'ar' ? 'إغلاق الموسوعة' : 'Close Almanac'}
            className="wood-button p-1.5 rounded cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Farmer Level & Daily Market Surge Summary */}
        <div className="px-4 sm:px-5 pt-3 sm:pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
          <div
            data-testid="almanac-level-card"
            className="p-3 rounded-lg bg-[#fbf2e1] border border-[#d6be96] space-y-1.5"
          >
            <div className="flex items-center justify-between text-xs font-bold text-[#2c1e14]">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#d97706]" />
                {t.farmerLevelLabel.replace('{n}', String(level))}
              </span>
              <span className="font-mono-tabular text-[#694d36]">
                {xp}/{xpNeed} {t.xpLabel}
              </span>
            </div>
            <div className="h-2.5 bg-[#e3cfa9] rounded-full overflow-hidden border border-[#c7ae82]">
              <div className="h-full bg-[#3d7a47] transition-all" style={{ width: `${xpPct}%` }} />
            </div>
          </div>

          <div
            data-testid="almanac-surge-card"
            className="p-3 rounded-lg bg-[#fef6dc] border border-[#cfa859] flex items-center justify-between gap-2.5"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ItemIcon id={surgeCrop} className="w-8 h-8 shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-[#8a5708] flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t.marketSurgeLabel}</span>
                </div>
                <div className="text-sm font-bold text-[#2c1e14] truncate">{surgeLabel.name}</div>
              </div>
            </div>
            <span
              dir="ltr"
              className="px-2 py-0.5 rounded bg-[#3d7a47] text-white text-xs font-mono-tabular font-bold shrink-0"
            >
              +50%
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-4 sm:px-5 pt-2.5 sm:pt-3 pb-2 border-b border-[#d9c39c] overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setTab('crops')}
            className={`px-3.5 py-1.5 rounded-md text-sm font-semibold cursor-pointer whitespace-nowrap ${
              tab === 'crops'
                ? 'bg-[#3d7a47] text-white'
                : 'bg-[#e5d2af] text-[#4a3322] hover:bg-[#dbc39a]'
            }`}
          >
            {t.almanacCropsTab} ({cropList.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('artisan')}
            className={`px-3.5 py-1.5 rounded-md text-sm font-semibold cursor-pointer whitespace-nowrap ${
              tab === 'artisan'
                ? 'bg-[#3d7a47] text-white'
                : 'bg-[#e5d2af] text-[#4a3322] hover:bg-[#dbc39a]'
            }`}
          >
            {t.almanacArtisanTab} ({ARTISAN_ITEMS.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto modal-scroll p-4 sm:p-5">
          {tab === 'crops' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {cropList.map((cropId) => {
                const def = CROPS[cropId];
                const label = getItemLabel(cropId, lang);
                const isDiscovered = discovered.has(cropId) || discovered.has(def.seedId);
                const isSurge = cropId === surgeCrop;
                const seasonsText = def.favoriteSeasons
                  .map((s) => translateSeason(s, lang))
                  .join(' · ');

                return (
                  <div
                    key={cropId}
                    className={`p-3 rounded-lg border flex items-start gap-3 ${
                      isSurge
                        ? 'bg-[#fef6dc] border-[#d97706]'
                        : isDiscovered
                        ? 'bg-[#fbf2e1] border-[#d6be96]'
                        : 'bg-[#ede0c4]/65 border-[#cbb48d] opacity-80'
                    }`}
                  >
                    <ItemIcon id={cropId} className="w-9 h-9 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-sm text-[#2c1e14] truncate">
                          {label.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            isDiscovered
                              ? 'bg-[#3d7a47] text-white'
                              : 'bg-[#d8c39b] text-[#5c4028]'
                          }`}
                        >
                          {isDiscovered ? (
                            <CheckCircle2 className="w-2.5 h-2.5" />
                          ) : (
                            <Lock className="w-2.5 h-2.5" />
                          )}
                          {isDiscovered ? t.discoveredLabel : t.lockedBadge}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#694d36] mt-0.5 leading-snug">
                        {label.description}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-mono-tabular text-[#5c4028]">
                        <span dir="ltr">{def.daysToGrow}d</span>
                        <span>·</span>
                        <span dir="ltr" className="font-bold text-[#7d5207]">{def.sellPrice}g</span>
                        <span>·</span>
                        <span dir="ltr" className="text-[#2f6e3a]">+{def.edibleStamina}</span>
                        <span>·</span>
                        <span>{seasonsText}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'artisan' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ARTISAN_ITEMS.map((itemId) => {
                const def = ITEMS[itemId];
                const label = getItemLabel(itemId, lang);
                const isDiscovered = discovered.has(itemId);

                return (
                  <div
                    key={itemId}
                    className={`p-3 rounded-lg border flex items-start gap-3 ${
                      isDiscovered
                        ? 'bg-[#fbf2e1] border-[#d6be96]'
                        : 'bg-[#ede0c4]/65 border-[#cbb48d] opacity-80'
                    }`}
                  >
                    <ItemIcon id={itemId} className="w-9 h-9 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-sm text-[#2c1e14] truncate">
                          {label.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            isDiscovered
                              ? 'bg-[#3d7a47] text-white'
                              : 'bg-[#d8c39b] text-[#5c4028]'
                          }`}
                        >
                          {isDiscovered ? (
                            <CheckCircle2 className="w-2.5 h-2.5" />
                          ) : (
                            <Lock className="w-2.5 h-2.5" />
                          )}
                          {isDiscovered ? t.discoveredLabel : t.lockedBadge}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#694d36] mt-0.5 leading-snug">
                        {label.description}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-mono-tabular text-[#5c4028]">
                        {def.sellPrice && (
                          <span dir="ltr" className="font-bold text-[#7d5207]">{def.sellPrice}g</span>
                        )}
                        {def.edibleStamina && (
                          <>
                            <span>·</span>
                            <span dir="ltr" className="text-[#2f6e3a]">+{def.edibleStamina}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
