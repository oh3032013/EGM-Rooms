import { useState } from 'react';
import { PackageCheck, TrendingUp, X } from 'lucide-react';
import {
  CHICKEN_PRICE,
  COW_PRICE,
  CROPS,
  DOG_PRICE,
  ITEMS,
  MAX_CHICKENS,
  MAX_COWS,
  MAX_DOGS,
  MAX_SHEEP,
  SHEEP_PRICE,
  SHOP_CATALOG,
} from '../game/constants';
import { getItemLabel, translateSeason, UI_TEXT, type Language } from '../game/i18n';
import type { CropType, DailyOrder, ItemId, Season, ToolType, ToolUpgrades } from '../game/types';
import { ChickenIcon, CoinIcon, CowIcon, DogIcon, ItemIcon, SheepIcon } from './PixelIcons';

interface ShopModalProps {
  lang: Language;
  gold: number;
  season: Season;
  inventory: Partial<Record<ItemId, number>>;
  upgrades: ToolUpgrades;
  chickensCount: number;
  cowsCount?: number;
  sheepCount?: number;
  hasDog?: boolean;
  marketSurgeCrop?: CropType;
  dailyOrder?: DailyOrder;
  onFulfillOrder?: () => void;
  onBuyItem: (id: ItemId, qty: number) => void;
  onSellItem: (id: ItemId, qty: number) => void;
  onUpgradeTool: (tool: ToolType) => void;
  onBuyChicken: () => void;
  onBuyCow?: () => void;
  onBuySheep?: () => void;
  onBuyDog?: () => void;
  onClose: () => void;
}

export function ShopModal({
  lang,
  gold,
  season,
  inventory,
  upgrades,
  chickensCount,
  cowsCount = 0,
  sheepCount = 0,
  hasDog = false,
  marketSurgeCrop,
  dailyOrder,
  onFulfillOrder,
  onBuyItem,
  onSellItem,
  onUpgradeTool,
  onBuyChicken,
  onBuyCow,
  onBuySheep,
  onBuyDog,
  onClose,
}: ShopModalProps) {
  const [tab, setTab] = useState<'seeds' | 'sell' | 'upgrades'>('seeds');
  const t = UI_TEXT[lang];

  const sellableItems = (Object.entries(inventory) as [ItemId, number][]).filter(
    ([id, count]) => count > 0 && ITEMS[id]?.category === 'crop' && ITEMS[id]?.sellPrice
  );

  const seedItems = SHOP_CATALOG.filter((c) => c.tab === 'seeds');
  const decorItems = SHOP_CATALOG.filter((c) => c.tab === 'decor');

  const toolRows: { tool: ToolType; name: string; level: number; benefit: string }[] = [
    { tool: 'hoe', name: t.hoeName, level: upgrades.hoeLevel, benefit: t.hoeBenefit },
    { tool: 'watering_can', name: t.canName, level: upgrades.canLevel, benefit: t.canBenefit },
    { tool: 'axe', name: t.axeName, level: upgrades.axeLevel, benefit: t.axeBenefit },
  ];

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label={t.shopTitle}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="parchment-panel rounded-xl w-full max-w-2xl max-h-[86vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-[#c9b086] bg-[#ebd8b5]">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#2c1e14]">{t.shopTitle}</h2>
            <p className="text-xs text-[#694d36]">
              {t.shopSub.replace('{season}', translateSeason(season, lang))}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 font-mono-tabular font-bold text-lg text-[#7d5207]">
              <CoinIcon className="w-5 h-5" />
              <span>{Math.round(gold)}g</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={lang === 'ar' ? 'إغلاق سوق القرية' : 'Close Village Shop'}
              className="wood-button p-1.5 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-5 pt-3 pb-2 border-b border-[#d9c39c] overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab('seeds')}
            className={`px-3.5 py-1.5 rounded-md text-sm font-semibold cursor-pointer whitespace-nowrap ${
              tab === 'seeds' ? 'bg-[#3d7a47] text-white' : 'bg-[#e5d2af] text-[#4a3322] hover:bg-[#dbc39a]'
            }`}
          >
            {t.seedsTab}
          </button>
          <button
            type="button"
            onClick={() => setTab('sell')}
            className={`px-3.5 py-1.5 rounded-md text-sm font-semibold cursor-pointer whitespace-nowrap ${
              tab === 'sell' ? 'bg-[#3d7a47] text-white' : 'bg-[#e5d2af] text-[#4a3322] hover:bg-[#dbc39a]'
            }`}
          >
            {t.sellTab} ({sellableItems.reduce((acc, [, q]) => acc + q, 0)})
          </button>
          <button
            type="button"
            onClick={() => setTab('upgrades')}
            className={`px-3.5 py-1.5 rounded-md text-sm font-semibold cursor-pointer whitespace-nowrap ${
              tab === 'upgrades' ? 'bg-[#3d7a47] text-white' : 'bg-[#e5d2af] text-[#4a3322] hover:bg-[#dbc39a]'
            }`}
          >
            {t.upgradesTab}
          </button>
        </div>

        {/* Daily Village Order Banner */}
        {dailyOrder && (
          <div
            data-testid="daily-order-card"
            className={`mx-5 mt-3 p-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 ${
              dailyOrder.completed
                ? 'bg-[#e6f4ea] border-[#7bbd8c]'
                : 'bg-[#fef6dc] border-[#cfa859]'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <ItemIcon id={dailyOrder.cropId} className="w-8 h-8 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-xs sm:text-sm text-[#2c1e14] flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1">
                    <PackageCheck className="w-4 h-4 text-[#8c5a14]" />
                    {t.dailyOrderTitle}:
                  </span>
                  <span>
                    {getItemLabel(dailyOrder.cropId, lang).name}{' '}
                    <span className="font-mono-tabular">
                      ({Math.min(inventory[dailyOrder.cropId] ?? 0, dailyOrder.requiredQty)}/
                      {dailyOrder.requiredQty})
                    </span>
                  </span>
                </div>
                <div className="text-[11px] text-[#694d36] flex flex-wrap items-center gap-1.5">
                  <span>{t.dailyOrderSub}</span>
                  <span aria-hidden="true">·</span>
                  <span dir="ltr" className="font-mono-tabular font-bold text-[#7d5207]">
                    +{dailyOrder.rewardGold}g
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular font-bold text-[#2f6e3a]">
                    {t.staminaBonus.replace('{n}', String(dailyOrder.rewardStamina))}
                  </span>
                </div>
              </div>
            </div>
            {dailyOrder.completed ? (
              <span className="px-3 py-1 rounded bg-[#3d7a47] text-white text-xs font-bold whitespace-nowrap">
                {t.orderDoneLabel}
              </span>
            ) : (
              <button
                type="button"
                disabled={(inventory[dailyOrder.cropId] ?? 0) < dailyOrder.requiredQty}
                onClick={onFulfillOrder}
                className="wood-button-primary px-3 py-1.5 rounded text-xs font-bold disabled:opacity-45 cursor-pointer whitespace-nowrap"
              >
                {t.deliverOrderBtn} (+{dailyOrder.rewardGold}g)
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {tab === 'seeds' &&
            seedItems.map(({ id }) => {
              const def = ITEMS[id];
              const label = getItemLabel(id, lang);
              const crop = def.cropType ? CROPS[def.cropType] : null;
              const inSeason = crop ? crop.favoriteSeasons.includes(season) : false;
              const owned = inventory[id] ?? 0;
              const price = def.buyPrice ?? 0;

              return (
                <div
                  key={id}
                  className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 rounded-lg bg-[#fbf2e1] border border-[#d6be96]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ItemIcon id={id} className="w-9 h-9 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-[#2c1e14] flex flex-wrap items-center gap-2">
                        <span>{label.name}</span>
                        {inSeason && (
                          <span className="text-xs font-medium text-[#2f6e3a]">{t.inSeason}</span>
                        )}
                        {owned > 0 && (
                          <span className="text-xs font-mono-tabular text-[#6b4f35]">
                            ({t.owned}: {owned})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#694d36]">{label.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={gold < price}
                      onClick={() => onBuyItem(id, 1)}
                      className="wood-button-primary px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-45 cursor-pointer whitespace-nowrap"
                    >
                      {t.buy1} ({price}g)
                    </button>
                    <button
                      type="button"
                      disabled={gold < price * 5}
                      onClick={() => onBuyItem(id, 5)}
                      className="wood-button px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-45 cursor-pointer whitespace-nowrap"
                    >
                      x5 ({price * 5}g)
                    </button>
                  </div>
                </div>
              );
            })}

          {tab === 'sell' &&
            (sellableItems.length === 0 ? (
              <div className="text-center py-10 text-sm text-[#694d36]">{t.emptyBasket}</div>
            ) : (
              sellableItems.map(([id, count]) => {
                const def = ITEMS[id];
                const label = getItemLabel(id, lang);
                let unitPrice = def.sellPrice ?? 0;
                const inSeason = def.cropType
                  ? CROPS[def.cropType].favoriteSeasons.includes(season)
                  : false;
                if (inSeason) unitPrice = Math.round(unitPrice * 1.25);
                const isSurge = Boolean(def.cropType && marketSurgeCrop === def.cropType);
                if (isSurge) unitPrice = Math.round(unitPrice * 1.5);

                return (
                  <div
                    key={id}
                    className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 rounded-lg border ${
                      isSurge
                        ? 'bg-[#fef6dc] border-[#d97706]'
                        : 'bg-[#fbf2e1] border-[#d6be96]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ItemIcon id={id} className="w-9 h-9 shrink-0" />
                      <div>
                        <div className="font-semibold text-sm text-[#2c1e14] flex flex-wrap items-center gap-2">
                          <span>
                            {label.name} <span className="font-mono-tabular">x{count}</span>
                          </span>
                          {inSeason && (
                            <span className="text-xs text-[#2f6e3a]">{t.seasonBonus}</span>
                          )}
                          {isSurge && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-[#b45309]">
                              <TrendingUp className="w-3 h-3" />
                              {t.marketSurgeBadge}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#694d36]">
                          {t.sellsFor} <span className="font-mono-tabular font-semibold">{unitPrice}g</span> {t.each}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSellItem(id, 1)}
                        className="wood-button px-3 py-1.5 rounded text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        {t.sell1} (<span dir="ltr">+{unitPrice}g</span>)
                      </button>
                      {count > 1 && (
                        <button
                          type="button"
                          onClick={() => onSellItem(id, count)}
                          className="wood-button-primary px-3 py-1.5 rounded text-xs font-semibold cursor-pointer whitespace-nowrap"
                        >
                          {t.sellAll} (<span dir="ltr">+{unitPrice * count}g</span>)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ))}

          {tab === 'upgrades' && (
            <>
              <div className="text-xs font-semibold text-[#5c4028] uppercase tracking-wider">
                {t.toolUpgrades}
              </div>
              {toolRows.map((row) => {
                const isMax = row.level >= 3;
                const cost = row.level === 1 ? 120 : 260;
                const tierLabel =
                  row.level === 1 ? t.tierIron : row.level === 2 ? t.tierCopper : t.tierMaster;
                return (
                  <div
                    key={row.tool}
                    className="flex items-center justify-between gap-4 p-3 rounded-lg bg-[#fbf2e1] border border-[#d6be96]"
                  >
                    <div className="flex items-center gap-3">
                      <ItemIcon id={row.tool} className="w-9 h-9 shrink-0" />
                      <div>
                        <div className="font-semibold text-sm text-[#2c1e14]">
                          {row.name} · {tierLabel}
                        </div>
                        <div className="text-xs text-[#694d36]">{row.benefit}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isMax || gold < cost}
                      onClick={() => onUpgradeTool(row.tool)}
                      className="wood-button-primary px-3.5 py-1.5 rounded text-xs font-semibold disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {isMax ? t.maxTier : `${t.upgrade} (${cost}g)`}
                    </button>
                  </div>
                );
              })}

              <div className="text-xs font-semibold text-[#5c4028] uppercase tracking-wider pt-2">
                {t.livestockHeader}
              </div>
              <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-[#fef6dc] border border-[#cfa859]">
                <div className="flex items-center gap-3">
                  <ChickenIcon className="w-9 h-9 shrink-0" />
                  <div>
                    <div className="font-semibold text-sm text-[#2c1e14] flex items-center gap-2">
                      <span>{t.chickenName}</span>
                      <span className="text-xs font-mono-tabular text-[#6b4f35]">
                        ({chickensCount}/{MAX_CHICKENS})
                      </span>
                    </div>
                    <div className="text-xs text-[#694d36]">{t.chickenDesc}</div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={chickensCount >= MAX_CHICKENS || gold < CHICKEN_PRICE}
                  onClick={onBuyChicken}
                  className="wood-button-primary px-3.5 py-1.5 rounded text-xs font-semibold disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {chickensCount >= MAX_CHICKENS ? t.coopFull : `${t.adoptChicken} (${CHICKEN_PRICE}g)`}
                </button>
              </div>

              {onBuyCow && (
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-[#fef6dc] border border-[#cfa859]">
                  <div className="flex items-center gap-3">
                    <CowIcon className="w-9 h-9 shrink-0" />
                    <div>
                      <div className="font-semibold text-sm text-[#2c1e14] flex items-center gap-2">
                        <span>{t.cowName}</span>
                        <span className="text-xs font-mono-tabular text-[#6b4f35]">
                          ({cowsCount}/{MAX_COWS})
                        </span>
                      </div>
                      <div className="text-xs text-[#694d36]">{t.cowDesc}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={cowsCount >= MAX_COWS || gold < COW_PRICE}
                    onClick={onBuyCow}
                    className="wood-button-primary px-3.5 py-1.5 rounded text-xs font-semibold disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {cowsCount >= MAX_COWS ? t.coopFull : `${t.adoptChicken} (${COW_PRICE}g)`}
                  </button>
                </div>
              )}

              {onBuySheep && (
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-[#fef6dc] border border-[#cfa859]">
                  <div className="flex items-center gap-3">
                    <SheepIcon className="w-9 h-9 shrink-0" />
                    <div>
                      <div className="font-semibold text-sm text-[#2c1e14] flex items-center gap-2">
                        <span>{t.sheepName}</span>
                        <span className="text-xs font-mono-tabular text-[#6b4f35]">
                          ({sheepCount}/{MAX_SHEEP})
                        </span>
                      </div>
                      <div className="text-xs text-[#694d36]">{t.sheepDesc}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={sheepCount >= MAX_SHEEP || gold < SHEEP_PRICE}
                    onClick={onBuySheep}
                    className="wood-button-primary px-3.5 py-1.5 rounded text-xs font-semibold disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {sheepCount >= MAX_SHEEP ? t.coopFull : `${t.adoptChicken} (${SHEEP_PRICE}g)`}
                  </button>
                </div>
              )}

              {onBuyDog && (
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-[#fef6dc] border border-[#cfa859]">
                  <div className="flex items-center gap-3">
                    <DogIcon className="w-9 h-9 shrink-0" />
                    <div>
                      <div className="font-semibold text-sm text-[#2c1e14] flex items-center gap-2">
                        <span>{t.dogName}</span>
                        <span className="text-xs font-mono-tabular text-[#6b4f35]">
                          ({hasDog ? 1 : 0}/{MAX_DOGS})
                        </span>
                      </div>
                      <div className="text-xs text-[#694d36]">{t.dogDesc}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={hasDog || gold < DOG_PRICE}
                    onClick={onBuyDog}
                    className="wood-button-primary px-3.5 py-1.5 rounded text-xs font-semibold disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {hasDog ? t.coopFull : `${t.adoptChicken} (${DOG_PRICE}g)`}
                  </button>
                </div>
              )}

              <div className="text-xs font-semibold text-[#5c4028] uppercase tracking-wider pt-2">
                {t.defensesDecor}
              </div>
              {decorItems.map(({ id }) => {
                const def = ITEMS[id];
                const label = getItemLabel(id, lang);
                const price = def.buyPrice ?? 0;
                const owned = inventory[id] ?? 0;
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-4 p-3 rounded-lg bg-[#fbf2e1] border border-[#d6be96]"
                  >
                    <div className="flex items-center gap-3">
                      <ItemIcon id={id} className="w-9 h-9 shrink-0" />
                      <div>
                        <div className="font-semibold text-sm text-[#2c1e14] flex flex-wrap items-center gap-2">
                          <span>{label.name}</span>
                          {owned > 0 && (
                            <span className="text-xs font-mono-tabular text-[#6b4f35]">
                              ({t.owned}: {owned})
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#694d36]">{label.description}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={gold < price}
                      aria-label={lang === 'ar' ? `شراء ${label.name}` : `Buy ${label.name}`}
                      onClick={() => onBuyItem(id, 1)}
                      className="wood-button-primary px-3.5 py-1.5 rounded text-xs font-semibold disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {t.buy} ({price}g)
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
