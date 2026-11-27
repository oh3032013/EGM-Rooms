import { PartyPopper, Sparkles, X } from 'lucide-react';
import { getFeatureText, getFestivalLabel, translateSeason, type Language } from '../game/i18n';
import { getSeason, hasClaimedCurrentFestival, isFestivalDay } from '../game/rules';
import type { GameWorldState, ItemId } from '../game/types';
import { ItemIcon } from './PixelIcons';

interface FestivalModalProps {
  world: GameWorldState;
  lang: Language;
  onClaimFestival: () => void;
  onClose: () => void;
}

export function FestivalModal({ world, lang, onClaimFestival, onClose }: FestivalModalProps) {
  const season = getSeason(world.seasonIndex);
  const fLabel = getFestivalLabel(season, lang);
  const fx = getFeatureText(lang);
  const isDay8 = isFestivalDay(world);
  const claimed = hasClaimedCurrentFestival(world);

  const rewardItemId: ItemId =
    season === 'Spring'
      ? 'apple_sapling'
      : season === 'Summer'
      ? 'olive_sapling'
      : season === 'Autumn'
      ? 'pumpkin_pie'
      : 'date_smoothie';

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center safe-area-modal bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label={fLabel.title}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="parchment-panel rounded-xl w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 border-b-2 border-[#c9b086] bg-gradient-to-r from-[#ebd8b5] to-[#f7e5bc] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#9a3412] text-[#fde047] flex items-center justify-center border border-[#7c2d12] shrink-0">
              <PartyPopper className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#9a3412]">
                {translateSeason(season, lang)} · {fx.festivalDayBadge}
              </div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-[#2c1e14] truncate">
                {fLabel.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'ar' ? 'إغلاق نافذة المهرجان' : 'Close Festival Modal'}
            className="wood-button p-1.5 rounded cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto modal-scroll p-4 sm:p-5 space-y-4">
          <p className="text-sm text-[#3d291a] leading-relaxed">{fLabel.subtitle}</p>

          <div className="p-3.5 rounded-lg bg-[#fef6dc] border-2 border-[#cfa859] flex items-center gap-3">
            <ItemIcon id={rewardItemId} className="w-10 h-10 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#8a5708] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{fx.festivalDayBadge}</span>
              </div>
              <div className="text-sm font-semibold text-[#2c1e14] mt-0.5">{fLabel.reward}</div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {claimed ? (
              <span className="px-4 py-2 rounded-md bg-[#3d7a47] text-white text-xs sm:text-sm font-bold">
                {fx.festivalClaimedBadge}
              </span>
            ) : (
              <button
                type="button"
                disabled={!isDay8 || claimed}
                data-testid="claim-festival-btn"
                onClick={onClaimFestival}
                className="wood-button-primary px-5 py-2 rounded-md text-sm font-bold disabled:opacity-45 cursor-pointer"
              >
                {fx.festivalClaimBtn}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
