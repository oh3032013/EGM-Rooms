import { useEffect, useState } from 'react';
import { ArrowLeftRight, Check, Handshake, Shield, Sprout, Timer, Trophy, Users, Waves, X } from 'lucide-react';
import { ITEMS } from '../game/constants';
import { getFeatureText, getItemLabel, type Language } from '../game/i18n';
import type { CoopChallengeKind, CoopChallengeState, TradeOffer } from '../game/multiplayer';
import type { GameWorldState, ItemId } from '../game/types';
import type { RoomHudState } from './GameHUD';
import { ItemIcon } from './PixelIcons';

interface CoopHubModalProps {
  lang: Language;
  world: GameWorldState;
  roomHud: RoomHudState;
  coopChallenge: CoopChallengeState | null;
  tradeOffers: TradeOffer[];
  onStartChallenge: (kind: CoopChallengeKind) => void;
  onSendTrade: (payload: {
    toId: string;
    giveItemId: ItemId;
    giveQty: number;
    requestItemId: ItemId;
    requestQty: number;
  }) => void;
  onAcceptTrade: (tradeId: string) => void;
  onDeclineTrade: (tradeId: string) => void;
  onClose: () => void;
}

const TRADE_REQUEST_CANDIDATES: ItemId[] = [
  'wheat',
  'carrot',
  'potato',
  'tomato',
  'corn',
  'strawberry',
  'pumpkin',
  'wood',
  'stone',
  'egg',
  'milk',
  'honey',
  'apple',
  'olive',
  'date_fruit',
  'fish',
  'fertilizer',
  'pest_spray',
];

export function CoopHubModal({
  lang,
  world,
  roomHud,
  coopChallenge,
  tradeOffers,
  onStartChallenge,
  onSendTrade,
  onAcceptTrade,
  onDeclineTrade,
  onClose,
}: CoopHubModalProps) {
  const fx = getFeatureText(lang);
  const [tab, setTab] = useState<'challenges' | 'trading'>('challenges');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const ownedTradeable = (Object.entries(world.inventory) as [ItemId, number][])
    .filter(([id, qty]) => qty > 0 && ITEMS[id]?.category !== 'tool')
    .map(([id, qty]) => ({ id, qty }));

  const [giveItemId, setGiveItemId] = useState<ItemId>(ownedTradeable[0]?.id ?? 'wood');
  const [giveQty, setGiveQty] = useState<number>(1);
  const [requestItemId, setRequestItemId] = useState<ItemId>(
    ownedTradeable[0]?.id === 'carrot' ? 'wheat' : 'carrot'
  );
  const [requestQty, setRequestQty] = useState<number>(1);
  const [targetId, setTargetId] = useState<string>('anyone');

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (ownedTradeable.length > 0 && !ownedTradeable.some((o) => o.id === giveItemId)) {
      setGiveItemId(ownedTradeable[0].id);
    }
  }, [giveItemId, ownedTradeable]);

  const challengeRemainingSec =
    coopChallenge && coopChallenge.status === 'active'
      ? Math.max(0, Math.ceil((coopChallenge.expiresAtMs - nowMs) / 1000))
      : 0;
  const teammates = roomHud.players.filter((p) => p.id !== roomHud.playerId);
  const maxGive = Math.max(1, Math.min(20, world.inventory[giveItemId] ?? 1));

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center safe-area-modal bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label={fx.coopHubTitle}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="parchment-panel rounded-xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 sm:py-3.5 border-b-2 border-[#c9b086] bg-[#ebd8b5] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#1e40af] text-[#fdf3dc] flex items-center justify-center border border-[#172554] shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-bold text-[#2c1e14] truncate">
                {fx.coopHubTitle}
              </h2>
              <p className="text-xs text-[#694d36] truncate">{fx.coopHubSub}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'ar' ? 'إغلاق لوحة التعاون' : 'Close Co-op Hub'}
            className="wood-button p-1.5 rounded cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 sm:px-5 pt-2.5 pb-2 border-b border-[#d9c39c] shrink-0">
          <button
            type="button"
            onClick={() => setTab('challenges')}
            className={`px-3.5 py-1.5 rounded-md text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5 ${
              tab === 'challenges' ? 'bg-[#3d7a47] text-white' : 'bg-[#e5d2af] text-[#4a3322]'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>{fx.challengesTab}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('trading')}
            data-testid="coop-trading-tab"
            className={`px-3.5 py-1.5 rounded-md text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5 ${
              tab === 'trading' ? 'bg-[#3d7a47] text-white' : 'bg-[#e5d2af] text-[#4a3322]'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>
              {fx.tradingTab} ({tradeOffers.length})
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto modal-scroll p-4 sm:p-5 space-y-4">
          {tab === 'challenges' && (
            <>
              {coopChallenge && (
                <div
                  data-testid="coop-active-challenge"
                  className={`p-3.5 rounded-lg border-2 space-y-2 ${
                    coopChallenge.status === 'completed'
                      ? 'bg-[#e6f4ea] border-[#4ade80]'
                      : coopChallenge.status === 'expired'
                      ? 'bg-[#fef2f2] border-[#fca5a5]'
                      : 'bg-[#fef6dc] border-[#cfa859]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-[#2c1e14] inline-flex items-center gap-1.5">
                      <Timer className="w-4 h-4 text-[#b45309]" />
                      <span>{fx.activeChallengeTitle}</span>
                    </span>
                    <span className="font-mono-tabular text-xs font-bold px-2 py-0.5 rounded bg-[#2c1e14] text-[#fde047]">
                      {coopChallenge.status === 'active'
                        ? fx.timeLeftSec.replace('{s}', String(challengeRemainingSec))
                        : coopChallenge.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="h-3 rounded-full bg-[#e3cfa9] overflow-hidden border border-[#c7ae82]">
                    <div
                      className="h-full bg-[#3d7a47] transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((coopChallenge.progress / Math.max(1, coopChallenge.target)) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5c4028]">
                    <span className="font-mono-tabular font-bold">
                      {coopChallenge.progress}/{coopChallenge.target}
                    </span>
                    <span>
                      {fx.rewardPoolLabel
                        .replace('{gold}', String(coopChallenge.rewardGold))
                        .replace('{xp}', '25')}
                    </span>
                  </div>
                  {Object.keys(coopChallenge.contributors).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {Object.entries(coopChallenge.contributors).map(([pid, count]) => {
                        const pName = roomHud.players.find((p) => p.id === pid)?.name ?? pid.slice(0, 6);
                        return (
                          <span
                            key={pid}
                            className="text-[11px] font-mono-tabular px-2 py-0.5 rounded bg-white/80 border border-[#d6be96] text-[#2c1e14]"
                          >
                            {pName}: {count}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2.5">
                <div className="text-xs font-bold uppercase tracking-wider text-[#5c4028]">
                  {fx.startChallengeHeader}
                </div>
                {(
                  [
                    {
                      kind: 'harvest' as CoopChallengeKind,
                      label: fx.challengeHarvest,
                      reward: '140g',
                      Icon: Sprout,
                    },
                    {
                      kind: 'water' as CoopChallengeKind,
                      label: fx.challengeWater,
                      reward: '110g',
                      Icon: Waves,
                    },
                    {
                      kind: 'defend' as CoopChallengeKind,
                      label: fx.challengeDefend,
                      reward: '150g',
                      Icon: Shield,
                    },
                  ] as const
                ).map(({ kind, label, reward, Icon }) => (
                  <div
                    key={kind}
                    className="p-3 rounded-lg bg-[#fbf2e1] border border-[#d6be96] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className="w-5 h-5 text-[#2f6e3a] shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-[#2c1e14]">{label}</div>
                        <div className="text-xs font-mono-tabular text-[#7d5207]">+{reward}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={coopChallenge?.status === 'active'}
                      data-testid={`start-coop-${kind}`}
                      onClick={() => onStartChallenge(kind)}
                      className="wood-button-primary px-3.5 py-1.5 rounded text-xs font-bold disabled:opacity-45 cursor-pointer shrink-0"
                    >
                      {lang === 'ar' ? 'ابدأ' : 'Launch'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'trading' && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!giveItemId || !requestItemId || giveItemId === requestItemId) return;
                  if ((world.inventory[giveItemId] ?? 0) < giveQty) return;
                  onSendTrade({
                    toId: targetId,
                    giveItemId,
                    giveQty,
                    requestItemId,
                    requestQty,
                  });
                }}
                className="p-3.5 rounded-lg bg-[#fbf2e1] border border-[#d6be96] space-y-3"
              >
                <div className="font-bold text-xs uppercase tracking-wider text-[#5c4028] flex items-center gap-1.5">
                  <Handshake className="w-4 h-4 text-[#2f6e3a]" />
                  <span>{fx.sendOfferTitle}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label className="block font-semibold text-[#5c4028] mb-1">{fx.offerItemLabel}</label>
                    <div className="flex gap-1.5">
                      <select
                        value={giveItemId}
                        onChange={(e) => setGiveItemId(e.target.value as ItemId)}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded bg-white border border-[#c9b086] text-[#2c1e14]"
                      >
                        {ownedTradeable.length === 0 ? (
                          <option value="wood">{getItemLabel('wood', lang).name} (0)</option>
                        ) : (
                          ownedTradeable.map((o) => (
                            <option key={o.id} value={o.id}>
                              {getItemLabel(o.id, lang).name} ({o.qty})
                            </option>
                          ))
                        )}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={maxGive}
                        value={giveQty}
                        onChange={(e) => setGiveQty(Math.max(1, Math.min(maxGive, Number(e.target.value) || 1)))}
                        className="w-14 px-2 py-1.5 rounded bg-white border border-[#c9b086] font-mono-tabular text-[#2c1e14]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#5c4028] mb-1">{fx.requestItemLabel}</label>
                    <div className="flex gap-1.5">
                      <select
                        value={requestItemId}
                        onChange={(e) => setRequestItemId(e.target.value as ItemId)}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded bg-white border border-[#c9b086] text-[#2c1e14]"
                      >
                        {TRADE_REQUEST_CANDIDATES.filter((c) => c !== giveItemId).map((id) => (
                          <option key={id} value={id}>
                            {getItemLabel(id, lang).name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={requestQty}
                        onChange={(e) => setRequestQty(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                        className="w-14 px-2 py-1.5 rounded bg-white border border-[#c9b086] font-mono-tabular text-[#2c1e14]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#5c4028] mb-1">{fx.targetPlayerLabel}</label>
                    <select
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      className="w-full px-2 py-1.5 rounded bg-white border border-[#c9b086] text-[#2c1e14]"
                    >
                      <option value="anyone">{lang === 'ar' ? 'أي لاعب بالغرفة' : 'Anyone in Room'}</option>
                      {teammates.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={ownedTradeable.length === 0 || (world.inventory[giveItemId] ?? 0) < giveQty}
                    data-testid="send-trade-btn"
                    className="wood-button-primary px-4 py-1.5 rounded text-xs font-bold disabled:opacity-45 cursor-pointer"
                  >
                    {fx.sendOfferBtn}
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-[#5c4028]">
                  {fx.incomingOffersTitle}
                </div>
                {tradeOffers.length === 0 ? (
                  <div className="p-4 rounded-lg bg-[#f4e6ca] border border-[#d6be96] text-xs text-[#694d36] text-center">
                    {fx.noOffersHint}
                  </div>
                ) : (
                  tradeOffers.map((offer) => {
                    const canAccept =
                      offer.fromId !== roomHud.playerId &&
                      (offer.toId === 'anyone' || offer.toId === roomHud.playerId) &&
                      (world.inventory[offer.giveItemId] ?? 0) >= offer.giveQty &&
                      (world.inventory[offer.requestItemId] ?? 0) >= offer.requestQty;
                    const canDecline =
                      offer.fromId === roomHud.playerId ||
                      offer.toId === roomHud.playerId ||
                      offer.toId === 'anyone';

                    return (
                      <div
                        key={offer.id}
                        data-testid={`trade-offer-${offer.id}`}
                        className="p-3 rounded-lg bg-[#fbf2e1] border border-[#d6be96] flex flex-wrap items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ItemIcon id={offer.giveItemId} className="w-7 h-7 shrink-0" />
                          <span className="font-mono-tabular text-xs font-bold text-[#2c1e14]">
                            {offer.giveQty}× {getItemLabel(offer.giveItemId, lang).name}
                          </span>
                          <ArrowLeftRight className="w-3.5 h-3.5 text-[#8a5708] shrink-0" />
                          <ItemIcon id={offer.requestItemId} className="w-7 h-7 shrink-0" />
                          <span className="font-mono-tabular text-xs font-bold text-[#2c1e14]">
                            {offer.requestQty}× {getItemLabel(offer.requestItemId, lang).name}
                          </span>
                          <span className="text-[11px] text-[#694d36]">
                            ({offer.fromName} → {offer.toName ?? (lang === 'ar' ? 'الجميع' : 'All')})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {offer.fromId !== roomHud.playerId && (
                            <button
                              type="button"
                              disabled={!canAccept}
                              onClick={() => onAcceptTrade(offer.id)}
                              className="wood-button-primary px-2.5 py-1 rounded text-xs font-bold disabled:opacity-45 cursor-pointer inline-flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>{fx.acceptTradeBtn}</span>
                            </button>
                          )}
                          {canDecline && (
                            <button
                              type="button"
                              onClick={() => onDeclineTrade(offer.id)}
                              className="wood-button px-2.5 py-1 rounded text-xs font-semibold text-[#fca5a5] cursor-pointer"
                            >
                              {fx.declineTradeBtn}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
