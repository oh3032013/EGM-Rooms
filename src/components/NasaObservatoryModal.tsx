import { CloudRain, Droplets, Leaf, Radio, Satellite, Sun, X } from 'lucide-react';
import { NASA_OBSERVATORY_CARDS } from '../game/constants';
import { getEcoRankLabel, getFeatureText, translateWeather, UI_TEXT, type Language } from '../game/i18n';
import {
  computeEcoScore,
  computeSoilMoisturePct,
  computeTemperatureC,
  hasNasaStation,
} from '../game/rules';
import type { GameWorldState, WeatherType } from '../game/types';
import { WeatherIcon } from './PixelIcons';

interface NasaObservatoryModalProps {
  world: GameWorldState;
  lang: Language;
  onClose: () => void;
}

export function NasaObservatoryModal({ world, lang, onClose }: NasaObservatoryModalProps) {
  const t = UI_TEXT[lang];
  const fx = getFeatureText(lang);
  const stationInstalled = hasNasaStation(world);
  const moisturePct = computeSoilMoisturePct(world);
  const tempC = computeTemperatureC(world);
  const tomorrow = world.forecastWeather ?? world.weather;
  const eco = computeEcoScore(world);

  const weatherTips: { w: WeatherType; hint: string }[] = [
    {
      w: 'Mist',
      hint: lang === 'ar' ? 'يروي التربة المحروثة تلقائياً بضباب خفيف' : 'Hydrates tilled soil with morning dew',
    },
    {
      w: 'Windy',
      hint: lang === 'ar' ? 'يضاعف إنتاج طواحين الرياح اليومي ×2' : 'Doubles daily Windmill gold income',
    },
    {
      w: 'Meteor',
      hint: lang === 'ar' ? 'زخة شهب تمنح +40g وفرصة كأس الشهب النجمي' : 'Shooting stars grant +40g & Star Chalice relic',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center safe-area-modal bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label={t.nasaModalTitle}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="parchment-panel rounded-xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 sm:py-3.5 border-b-2 border-[#c9b086] bg-[#ebd8b5] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#1d4e78] text-[#fdf3dc] flex items-center justify-center border border-[#0f2f4d] shrink-0">
              <Satellite className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-2xl font-bold text-[#2c1e14] truncate">
                {t.nasaModalTitle}
              </h2>
              <p className="text-xs text-[#694d36] truncate">{t.nasaModalSub}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'ar' ? 'إغلاق مرصد ناسا' : 'Close NASA Observatory'}
            className="wood-button p-1.5 rounded cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto modal-scroll p-4 sm:p-5 space-y-4">
          {/* Eco-Score & Green Grid */}
          <div
            data-testid="eco-score-panel"
            className="p-3.5 rounded-lg bg-[#e6f4ea] border-2 border-[#7bbd8c] space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Leaf className="w-4 h-4 text-[#2f6e3a]" />
                <span className="font-bold text-sm text-[#1e4620]">{fx.ecoGridTitle}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#2f6e3a] text-white text-xs font-bold">
                  {getEcoRankLabel(eco.rank, lang)}
                </span>
                <span className="font-mono-tabular font-extrabold text-base text-[#1e4620]">
                  {eco.total}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { label: fx.ecoEnergyLabel, val: eco.energyScore, max: 35, bar: 'bg-[#f59e0b]' },
                { label: fx.ecoWaterSoilLabel, val: eco.waterSoilScore, max: 35, bar: 'bg-[#0284c7]' },
                { label: fx.ecoBioLabel, val: eco.biodiversityScore, max: 30, bar: 'bg-[#16a34a]' },
              ].map((row) => (
                <div key={row.label} className="p-2 rounded bg-white/75 border border-[#b7dfc2]">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[#2c1e14] mb-1">
                    <span className="truncate">{row.label}</span>
                    <span className="font-mono-tabular">
                      {row.val}/{row.max}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#d7eadc] overflow-hidden">
                    <div
                      className={`h-full ${row.bar}`}
                      style={{ width: `${Math.min(100, Math.round((row.val / row.max) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#1e5631]">
                {eco.dividendGold > 0
                  ? fx.ecoDividendActive.replace('{g}', String(eco.dividendGold))
                  : fx.ecoDividendHint}
              </span>
              {eco.pestPenalty > 0 && (
                <span className="font-mono-tabular font-bold text-[#b91c1c]">
                  {fx.ecoPestPenaltyLabel}: -{eco.pestPenalty}
                </span>
              )}
            </div>
          </div>

          {/* 3 Educational Satellite Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {NASA_OBSERVATORY_CARDS.map((card) => {
              const Icon =
                card.code === 'SMAP'
                  ? Droplets
                  : card.code === 'GPM'
                  ? CloudRain
                  : Sun;
              const title = lang === 'ar' ? card.titleAr : card.titleEn;
              const desc = lang === 'ar' ? card.descAr : card.descEn;

              return (
                <div
                  key={card.code}
                  className="p-3.5 rounded-lg bg-[#fbf2e1] border-2 border-[#cbb187] flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular font-extrabold text-base px-2 py-0.5 rounded bg-[#18293b] text-[#f8fafc] tracking-wide">
                      {card.code}
                    </span>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center border border-[#c9b086]"
                      style={{ backgroundColor: `${card.accent}28` }}
                    >
                      <Icon className="w-4 h-4 text-[#1e3a5f]" />
                    </div>
                  </div>
                  <div className="font-semibold text-xs text-[#5c4028]">{title}</div>
                  <p className="text-sm font-medium text-[#2c1e14] leading-relaxed">{desc}</p>
                </div>
              );
            })}
          </div>

          {/* Dynamic Special Weathers Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {weatherTips.map((item) => (
              <div
                key={item.w}
                className="p-2.5 rounded-lg bg-[#fbf2e1] border border-[#d6be96] flex items-center gap-2.5"
              >
                <WeatherIcon weather={item.w} className="w-6 h-6 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-xs text-[#2c1e14]">{translateWeather(item.w, lang)}</div>
                  <div className="text-[11px] text-[#694d36] leading-snug">{item.hint}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Local Farm Weather Station Telemetry */}
          {stationInstalled ? (
            <div className="p-4 rounded-lg bg-[#e8eff5] border-2 border-[#7ea3c4]">
              <div className="flex items-center gap-2 mb-2.5 text-sm font-bold text-[#15314b]">
                <Radio className="w-4 h-4 text-[#1d6fa5]" />
                <span>{t.nasaStationTelemetryTitle}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-center">
                <div className="p-2.5 rounded bg-white/80 border border-[#b8cde0]">
                  <div className="text-[11px] text-[#4b637a]">{t.soilMoistureLabel}</div>
                  <div className="font-mono-tabular font-bold text-lg text-[#134e6f]">
                    {moisturePct}%
                  </div>
                </div>
                <div className="p-2.5 rounded bg-white/80 border border-[#b8cde0]">
                  <div className="text-[11px] text-[#4b637a]">{t.tempLabel}</div>
                  <div className="font-mono-tabular font-bold text-lg text-[#9a3412]">
                    {tempC}°C
                  </div>
                </div>
                <div className="p-2.5 rounded bg-white/80 border border-[#b8cde0]">
                  <div className="text-[11px] text-[#4b637a]">{t.tomorrowLabel}</div>
                  <div className="font-bold text-sm sm:text-base text-[#1e3a5f]">
                    {translateWeather(tomorrow, lang)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-[#f4e6ca] border border-[#cfa859] text-xs text-[#5c4028]">
              {t.nasaNoStationHint}
            </div>
          )}

          {/* Honest Educational Disclaimer */}
          <div className="p-3 rounded-lg bg-[#efe1c4] border border-[#c9b086] text-xs text-[#5c4028] leading-relaxed">
            {t.nasaDisclaimer}
          </div>
        </div>
      </div>
    </div>
  );
}
