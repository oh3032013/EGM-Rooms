import { useEffect, useRef, useState } from 'react';
import {
  Award,
  BookOpen,
  Camera,
  CheckCircle2,
  Flame,
  HelpCircle,
  Palette,
  PawPrint,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  FARMER_HATS,
  FARMER_OUTFITS,
  getDailyQuizForDay,
  getFarmerOutfitColors,
  HOW_TO_PLAY_CARDS,
  LUCKY_WHEEL_REWARDS,
  PET_NAME_PRESETS,
  sanitizePetName,
} from '../game/funFeatures';
import type { Language } from '../game/i18n';
import { resolveStoryLang } from '../game/story';
import type { FarmerStyle, GameWorldState } from '../game/types';

export type FunHubTabId = 'spin' | 'quiz' | 'style' | 'guide';

interface FunHubModalProps {
  world: GameWorldState;
  lang: Language;
  initialTab?: FunHubTabId;
  farmerStyle: FarmerStyle;
  rushActive: boolean;
  rushRemainingSec: number;
  rushProgress: number;
  rushTarget: number;
  onChangeStyle: (style: FarmerStyle) => void;
  onRenamePet: (kind: 'dog' | 'cat', name: string) => void;
  onSpinWheel: (rewardIndex: number) => void;
  onPlayWheelTick: () => void;
  onAnswerQuiz: (choiceIndex: number) => {
    ok: boolean;
    correct: boolean;
    fact: string;
    message: string;
  };
  onStartRush: () => void;
  onTakeSnapshot: () => boolean;
  onClose: () => void;
}

export function FunHubModal({
  world,
  lang,
  initialTab = 'spin',
  farmerStyle,
  rushActive,
  rushRemainingSec,
  rushProgress,
  rushTarget,
  onChangeStyle,
  onRenamePet,
  onSpinWheel,
  onPlayWheelTick,
  onAnswerQuiz,
  onStartRush,
  onTakeSnapshot,
  onClose,
}: FunHubModalProps) {
  const sLang = resolveStoryLang(lang);
  const isAr = sLang === 'ar';
  const [tab, setTab] = useState<FunHubTabId>(initialTab);

  // Lucky Wheel animation state
  const [wheelAngle, setWheelAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [wheelResultLabel, setWheelResultLabel] = useState<string | null>(null);
  const spinTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);

  // Quiz state
  const { question: dailyQuiz } = getDailyQuizForDay(world.day);
  const [pickedChoice, setPickedChoice] = useState<number | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<{ correct: boolean; fact: string } | null>(null);

  // Pet name drafts
  const [dogDraft, setDogDraft] = useState(() => world.petNames?.dog ?? '');
  const [catDraft, setCatDraft] = useState(() => world.petNames?.cat ?? '');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [photoSaved, setPhotoSaved] = useState(false);

  useEffect(() => {
    setDogDraft(world.petNames?.dog ?? '');
    setCatDraft(world.petNames?.cat ?? '');
  }, [world.petNames?.dog, world.petNames?.cat]);

  useEffect(() => {
    return () => {
      if (spinTimerRef.current !== null) window.clearTimeout(spinTimerRef.current);
      if (tickTimerRef.current !== null) window.clearInterval(tickTimerRef.current);
    };
  }, []);

  const outfitDef = getFarmerOutfitColors(farmerStyle);

  const handleSpinClick = () => {
    if (spinning || world.luckySpinUsedToday) return;
    const winnerIndex = Math.floor(Math.random() * LUCKY_WHEEL_REWARDS.length);
    const sliceDeg = 360 / LUCKY_WHEEL_REWARDS.length;
    // Wedge i has center at i * sliceDeg + sliceDeg / 2 clockwise from top
    const centerDeg = winnerIndex * sliceDeg + sliceDeg / 2;
    const jitter = (Math.random() - 0.5) * 18;
    const spins = 5 * 360;
    const targetMod = (360 - centerDeg + jitter + 360) % 360;
    const currentMod = ((wheelAngle % 360) + 360) % 360;
    const delta = spins + ((targetMod - currentMod + 360) % 360);

    setSpinning(true);
    setWheelResultLabel(null);
    setWheelAngle((prev) => prev + delta);

    let ticks = 0;
    if (tickTimerRef.current !== null) window.clearInterval(tickTimerRef.current);
    tickTimerRef.current = window.setInterval(() => {
      ticks += 1;
      onPlayWheelTick();
      if (ticks >= 14 && tickTimerRef.current !== null) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    }, 170);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const durationMs = prefersReducedMotion ? 180 : 3250;

    if (spinTimerRef.current !== null) window.clearTimeout(spinTimerRef.current);
    spinTimerRef.current = window.setTimeout(() => {
      if (tickTimerRef.current !== null) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      setSpinning(false);
      onSpinWheel(winnerIndex);
      setWheelResultLabel(LUCKY_WHEEL_REWARDS[winnerIndex].label[sLang]);
    }, durationMs);
  };

  const handleQuizClick = (idx: number) => {
    if (world.ecoQuizAnsweredToday || pickedChoice !== null) return;
    setPickedChoice(idx);
    const res = onAnswerQuiz(idx);
    setQuizFeedback({ correct: res.correct, fact: res.fact });
  };

  const handleSavePetName = (kind: 'dog' | 'cat', rawValue: string) => {
    const clean = sanitizePetName(rawValue);
    onRenamePet(kind, clean);
    if (kind === 'dog') setDogDraft(clean);
    else setCatDraft(clean);
    setSavedNotice(isAr ? 'تم حفظ الاسم!' : 'Name saved!');
    window.setTimeout(() => setSavedNotice(null), 1800);
  };

  const tabs: { id: FunHubTabId; label: string; icon: React.ReactNode; badge?: boolean }[] = [
    {
      id: 'spin',
      label: isAr ? 'الحظ واللعب' : 'Fun & Spin',
      icon: <Sparkles className="w-4 h-4 shrink-0" />,
      badge: !world.luckySpinUsedToday || !world.rushUsedToday,
    },
    {
      id: 'quiz',
      label: isAr ? 'سؤال اليوم' : 'Eco Quiz',
      icon: <HelpCircle className="w-4 h-4 shrink-0" />,
      badge: !world.ecoQuizAnsweredToday,
    },
    {
      id: 'style',
      label: isAr ? 'الشكل والحيوانات' : 'Style & Pets',
      icon: <Palette className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'guide',
      label: isAr ? 'دليل اللعب' : 'How to Play',
      icon: <BookOpen className="w-4 h-4 shrink-0" />,
    },
  ];

  // Build SVG wheel slices
  const sliceCount = LUCKY_WHEEL_REWARDS.length;
  const sliceAngle = (Math.PI * 2) / sliceCount;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center safe-area-modal bg-black/65"
      role="dialog"
      aria-modal="true"
      aria-label={isAr ? 'مركز المرح والمظهر' : 'Fun Hub & Customization'}
      dir={isAr ? 'rtl' : 'ltr'}
      onClick={(e) => {
        if (e.target === e.currentTarget && !spinning) onClose();
      }}
    >
      <div className="parchment-panel rounded-2xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b-2 border-[#b58d5e]/60 bg-[#ead5ae]/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#4d331f] border-2 border-[#f7d87c] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-[#fde047]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-lg sm:text-xl text-[#2c1e14] truncate">
                {isAr ? 'مركز المرح والتخصيص' : 'Farmer Fun Hub'}
              </h2>
              <p className="text-[11px] sm:text-xs text-[#694d36] truncate">
                {isAr
                  ? 'عجلة الحظ اليومية، تحدي البيئة، ملابس المزارع، والسباق الذهبي'
                  : 'Daily Lucky Wheel, Eco Quiz, Farmer Style, Golden Rush & Snapshots'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={spinning}
            onClick={onClose}
            aria-label={isAr ? 'إغلاق' : 'Close'}
            className="wood-button min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 px-3 sm:px-5 py-2.5 bg-[#dfd0af]/50 border-b border-[#b58d5e]/45 overflow-x-auto shrink-0">
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={spinning}
                onClick={() => setTab(item.id)}
                data-testid={`fun-tab-${item.id}`}
                className={`relative min-h-[40px] px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  active
                    ? 'wood-button-primary ring-2 ring-[#f7d87c]'
                    : 'bg-[#f6e8cb] text-[#4a321f] border border-[#b58d5e]/70 hover:bg-[#efe0be]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge && (
                  <span className="w-2 h-2 rounded-full bg-[#16a34a] ring-2 ring-white" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto modal-scroll p-4 sm:p-6 space-y-4">
          {tab === 'spin' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {/* 1. Lucky Wheel Card */}
              <div className="rounded-xl border-2 border-[#b58d5e] bg-[#fdf5e2] p-4 flex flex-col items-center text-center shadow-sm">
                <h3 className="font-display font-bold text-base sm:text-lg text-[#2c1e14] mb-1">
                  {isAr ? '🎡 عجلة الحصاد اليومية' : '🎡 Daily Harvest Wheel'}
                </h3>
                <p className="text-xs text-[#694d36] mb-3">
                  {isAr
                    ? 'لفة مجانية كل يوم لربح ذهب أو بذور نادرة أو سمكة كوي!'
                    : 'One free spin every day for gold, rare seeds, tea, or a Golden Koi!'}
                </p>

                {/* Wheel Container */}
                <div className="relative w-52 h-52 sm:w-56 sm:h-56 mb-3 select-none">
                  {/* Top Pointer */}
                  <div
                    className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent border-t-[#dc2626] drop-shadow"
                    aria-hidden="true"
                  />
                  <svg
                    viewBox="-110 -110 220 220"
                    className="w-full h-full drop-shadow-md will-change-transform"
                    style={{
                      transform: `rotate(${wheelAngle}deg)`,
                      transition: spinning
                        ? 'transform 3.2s cubic-bezier(0.16, 1, 0.3, 1)'
                        : undefined,
                    }}
                  >
                    <circle cx="0" cy="0" r="106" fill="#5c3a21" stroke="#f7d87c" strokeWidth="4" />
                    {LUCKY_WHEEL_REWARDS.map((rew, idx) => {
                      const a0 = idx * sliceAngle - Math.PI / 2;
                      const a1 = (idx + 1) * sliceAngle - Math.PI / 2;
                      const r = 98;
                      const x0 = Math.cos(a0) * r;
                      const y0 = Math.sin(a0) * r;
                      const x1 = Math.cos(a1) * r;
                      const y1 = Math.sin(a1) * r;
                      const mid = (a0 + a1) / 2;
                      const tx = Math.cos(mid) * 60;
                      const ty = Math.sin(mid) * 60;
                      const deg = (mid * 180) / Math.PI + 90;
                      return (
                        <g key={rew.id}>
                          <path
                            d={`M 0 0 L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`}
                            fill={rew.color}
                            stroke="#fdf5e2"
                            strokeWidth="2"
                          />
                          <text
                            x={tx.toFixed(1)}
                            y={ty.toFixed(1)}
                            fill="#ffffff"
                            fontSize="9.5"
                            fontWeight="800"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            transform={`rotate(${deg.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})`}
                            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.65)' }}
                          >
                            {rew.label[sLang]}
                          </text>
                        </g>
                      );
                    })}
                    <circle cx="0" cy="0" r="18" fill="#fdf3dc" stroke="#5c3a21" strokeWidth="3" />
                    <text
                      x="0"
                      y="1"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="14"
                    >
                      🌟
                    </text>
                  </svg>
                </div>

                <button
                  type="button"
                  disabled={spinning || Boolean(world.luckySpinUsedToday)}
                  onClick={handleSpinClick}
                  data-testid="lucky-wheel-spin-btn"
                  className="wood-button-primary w-full min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                >
                  {spinning
                    ? isAr
                      ? 'تدور العجلة...'
                      : 'Spinning...'
                    : world.luckySpinUsedToday
                    ? isAr
                      ? 'تم استخدام لفة اليوم — عد غداً!'
                      : 'Already spun today — come back tomorrow!'
                    : isAr
                    ? 'أدر العجلة الآن!'
                    : 'Spin Lucky Wheel!'}
                </button>

                {wheelResultLabel && (
                  <div className="mt-2.5 w-full rounded-lg bg-[#dcfce7] border border-[#16a34a] px-3 py-2 text-xs font-bold text-[#14532d]">
                    {isAr ? `مبروك! ربحت: ${wheelResultLabel}` : `Awesome! You won: ${wheelResultLabel}`}
                  </div>
                )}
              </div>

              {/* 2. Right Column: Golden Rush Challenge + Snapshot Camera */}
              <div className="space-y-4">
                {/* Golden Rush Hour Mini-Challenge */}
                <div className="rounded-xl border-2 border-[#d97706] bg-gradient-to-br from-[#fef3c7] to-[#fde68a]/70 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h3 className="font-display font-bold text-base text-[#78350f] flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-[#d97706]" />
                      <span>{isAr ? '⚡ تحدي ساعة الاندفاع الذهبية' : '⚡ Golden Rush 45s Blitz'}</span>
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-[#78350f] text-[#fef3c7] text-[10px] font-bold">
                      +65g · +35 XP
                    </span>
                  </div>
                  <p className="text-xs text-[#78350f]/90 mb-3 leading-relaxed">
                    {isAr
                      ? 'أنجز 5 أعمال زراعية سريعة (حرث، بذر، سقي، حصاد أو صيد يراعات) خلال 45 ثانية لتربح مكافأة ضخمة!'
                      : 'Complete 5 farm actions (till, plant, water, harvest, or catch fireflies) in 45 seconds for a big bonus!'}
                  </p>

                  {rushActive ? (
                    <div className="rounded-lg bg-[#451a03] text-[#fef3c7] px-3 py-2.5 flex items-center justify-between text-xs font-bold">
                      <span>
                        {isAr ? `التقدم: ${rushProgress}/${rushTarget}` : `Progress: ${rushProgress}/${rushTarget}`}
                      </span>
                      <span className="font-mono-tabular text-[#fde047]">{rushRemainingSec}s</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(world.rushUsedToday)}
                      onClick={() => {
                        onStartRush();
                        onClose();
                      }}
                      data-testid="start-rush-btn"
                      className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-b from-[#f59e0b] to-[#d97706] hover:from-[#fbbf24] hover:to-[#e08b12] text-white font-bold text-sm border-2 border-[#78350f] shadow cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Flame className="w-4 h-4" />
                      <span>
                        {world.rushUsedToday
                          ? isAr
                            ? 'اكتمل تحدي الاندفاع اليوم!'
                            : 'Today’s Rush Completed!'
                          : isAr
                          ? 'ابدأ تحدي الـ 45 ثانية!'
                          : 'Launch 45s Rush Challenge!'}
                      </span>
                    </button>
                  )}
                </div>

                {/* Farm Snapshot Polaroid Camera */}
                <div className="rounded-xl border-2 border-[#b58d5e] bg-[#fdf5e2] p-4 shadow-sm">
                  <h3 className="font-display font-bold text-base text-[#2c1e14] flex items-center gap-1.5 mb-1">
                    <Camera className="w-4 h-4 text-[#0284c7]" />
                    <span>{isAr ? '📸 كاميرا الذكريات' : '📸 Farm Snapshot Postcard'}</span>
                  </h3>
                  <p className="text-xs text-[#694d36] mb-3 leading-relaxed">
                    {isAr
                      ? 'التقط صورة فورية لمزرعتك بإطار بريدي تذكاري واحفظها على جهازك لمشاركتها مع أصدقائك!'
                      : 'Snap a framed scrapbook Polaroid PNG of your farm right now and download it to share!'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const ok = onTakeSnapshot();
                      if (ok) {
                        setPhotoSaved(true);
                        window.setTimeout(() => setPhotoSaved(false), 2500);
                      }
                    }}
                    data-testid="take-snapshot-btn"
                    className="wood-button w-full min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4 text-[#0284c7]" />
                    <span>
                      {photoSaved
                        ? isAr
                          ? 'تم حفظ البطاقة البريدية!'
                          : 'Postcard Downloaded!'
                        : isAr
                        ? 'التقط صورة للمزرعة (0)'
                        : 'Capture Snapshot (Key 0)'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'quiz' && (
            <div className="rounded-xl border-2 border-[#b58d5e] bg-[#fdf5e2] p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-[#16a34a]" />
                  <h3 className="font-display font-bold text-base sm:text-lg text-[#2c1e14]">
                    {isAr ? 'تحدي المزارع الذكي اليومي' : 'Daily Eco-Explorer Quiz'}
                  </h3>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-[#dcfce7] border border-[#16a34a]/40 text-xs font-bold text-[#14532d]">
                  +35g · +15 ⚡ · +25 XP
                </span>
              </div>

              <div className="rounded-xl bg-[#f5e7c8] border border-[#c9a574] p-4">
                <p className="font-display font-bold text-base sm:text-lg text-[#2c1e14] leading-snug">
                  {dailyQuiz.question[sLang]}
                </p>
              </div>

              <div className="space-y-2.5">
                {dailyQuiz.choices[sLang].map((choiceText, idx) => {
                  const answered = Boolean(world.ecoQuizAnsweredToday) || pickedChoice !== null;
                  const isCorrect = idx === dailyQuiz.correctIndex;
                  const isPicked = idx === pickedChoice;
                  let btnStyle =
                    'bg-white hover:bg-[#fef3c7] border-[#b58d5e] text-[#2c1e14]';
                  if (answered) {
                    if (isCorrect) {
                      btnStyle = 'bg-[#dcfce7] border-[#16a34a] text-[#14532d] ring-2 ring-[#22c55e]/40';
                    } else if (isPicked) {
                      btnStyle = 'bg-[#fee2e2] border-[#dc2626] text-[#7f1d1d]';
                    } else {
                      btnStyle = 'bg-[#f5ead4] border-[#cbb38e] text-[#694d36] opacity-75';
                    }
                  }
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={answered}
                      onClick={() => handleQuizClick(idx)}
                      data-testid={`eco-quiz-choice-${idx}`}
                      className={`w-full min-h-[46px] px-4 py-2.5 rounded-xl border-2 text-start text-sm font-bold transition-colors flex items-center justify-between gap-3 cursor-pointer disabled:cursor-default ${btnStyle}`}
                    >
                      <span>{choiceText}</span>
                      {answered && isCorrect && (
                        <CheckCircle2 className="w-5 h-5 text-[#16a34a] shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {(quizFeedback || world.ecoQuizAnsweredToday) && (
                <div className="rounded-xl bg-[#ecfdf5] border-2 border-[#34d399] p-3.5 text-xs sm:text-sm text-[#065f46] leading-relaxed">
                  <div className="font-bold mb-1">
                    {quizFeedback
                      ? quizFeedback.correct
                        ? isAr
                          ? '🌟 إجابة عبقرية! ربحت +35 ذهب و+15 طاقة و+25 خبرة!'
                          : '🌟 Genius answer! +35g, +15 Stamina & +25 XP earned!'
                        : isAr
                        ? '💡 معلومة رائعة للمرة القادمة! (+10 ذهب للمشاركة)'
                        : '💡 Great try — here is the science fact (+10g participation)!'
                      : isAr
                      ? '✅ أجبت على سؤال اليوم! عد غداً لتحدٍ جديد:'
                      : '✅ You completed today’s quiz! Come back tomorrow for a new one:'}
                  </div>
                  <p>{quizFeedback?.fact ?? dailyQuiz.fact[sLang]}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'style' && (
            <div className="space-y-4">
              {/* Farmer Wardrobe Preview & Selectors */}
              <div className="rounded-xl border-2 border-[#b58d5e] bg-[#fdf5e2] p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* Live Pixel-Art Style Preview */}
                  <div className="w-28 h-32 rounded-xl bg-gradient-to-b from-[#bae6fd] to-[#86efac] border-2 border-[#8b5e34] flex items-center justify-center shrink-0 relative overflow-hidden">
                    <div className="relative flex flex-col items-center">
                      {/* Hat */}
                      {farmerStyle.hat === 'straw' && (
                        <div className="relative flex flex-col items-center -mb-1 z-10">
                          <div className="w-7 h-3 bg-[#c49139] rounded-t-sm" />
                          <div className="w-7 h-1.5" style={{ backgroundColor: outfitDef.shirt }} />
                          <div className="w-11 h-2 bg-[#deb15b] rounded-sm" />
                        </div>
                      )}
                      {farmerStyle.hat === 'cap' && (
                        <div className="relative flex flex-col items-center -mb-1 z-10">
                          <div className="w-8 h-3.5 rounded-t-md" style={{ backgroundColor: outfitDef.shirt }} />
                          <div className="w-10 h-1.5 ml-2 rounded-sm" style={{ backgroundColor: outfitDef.accent }} />
                        </div>
                      )}
                      {farmerStyle.hat === 'wizard' && (
                        <div className="relative flex flex-col items-center -mb-1 z-10">
                          <div className="w-0 h-0 border-l-[14px] border-r-[14px] border-b-[20px] border-l-transparent border-r-transparent border-b-[#4c1d95]" />
                          <div className="w-11 h-2 bg-[#4c1d95] rounded-sm" />
                        </div>
                      )}
                      {farmerStyle.hat === 'crown' && (
                        <div className="w-8 h-3 bg-[#facc15] border border-[#b45309] -mb-0.5 z-10 rounded-t-sm" />
                      )}
                      {farmerStyle.hat === 'none' && (
                        <div className="w-8 h-2 bg-[#4a2c18] rounded-t-sm -mb-0.5 z-10" />
                      )}
                      {/* Head */}
                      <div className="w-8 h-6 bg-[#f2c89d] flex items-center justify-around px-1.5">
                        <span className="w-1.5 h-1.5 bg-[#26180f]" />
                        <span className="w-1.5 h-1.5 bg-[#26180f]" />
                      </div>
                      {/* Shirt & Overalls */}
                      <div className="w-9 h-3" style={{ backgroundColor: outfitDef.shirt }} />
                      <div className="w-9 h-6" style={{ backgroundColor: outfitDef.overalls }} />
                    </div>
                  </div>

                  <div className="flex-1 w-full space-y-3">
                    <div>
                      <div className="text-xs font-bold text-[#4a321f] mb-1.5">
                        {isAr ? '👕 اختر زي المزارع:' : '👕 Choose Farmer Outfit:'}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {FARMER_OUTFITS.map((o) => {
                          const selected = farmerStyle.outfit === o.id;
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => onChangeStyle({ ...farmerStyle, outfit: o.id })}
                              data-testid={`outfit-btn-${o.id}`}
                              className={`min-h-[40px] px-2.5 py-1.5 rounded-xl border-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                                selected
                                  ? 'border-[#2c1e14] bg-[#fef3c7] ring-2 ring-[#f59e0b]'
                                  : 'border-[#c9a574] bg-white hover:bg-[#faf0d7]'
                              }`}
                            >
                              <span
                                className="w-4 h-4 rounded-full border border-black/25 shrink-0"
                                style={{ backgroundColor: o.shirt }}
                              />
                              <span className="text-[#2c1e14]">{o.label[sLang]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-[#4a321f] mb-1.5">
                        {isAr ? '🎩 اختر القبعة:' : '🎩 Choose Hat Style:'}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {FARMER_HATS.map((h) => {
                          const selected = farmerStyle.hat === h.id;
                          return (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => onChangeStyle({ ...farmerStyle, hat: h.id })}
                              data-testid={`hat-btn-${h.id}`}
                              className={`min-h-[40px] px-3 py-1.5 rounded-xl border-2 text-xs font-bold cursor-pointer ${
                                selected
                                  ? 'border-[#2c1e14] bg-[#fef3c7] ring-2 ring-[#f59e0b] text-[#2c1e14]'
                                  : 'border-[#c9a574] bg-white hover:bg-[#faf0d7] text-[#4a321f]'
                              }`}
                            >
                              {h.label[sLang]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pet Names Section */}
              <div className="rounded-xl border-2 border-[#b58d5e] bg-[#fdf5e2] p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-bold text-base text-[#2c1e14] flex items-center gap-1.5">
                    <PawPrint className="w-4 h-4 text-[#d97706]" />
                    <span>{isAr ? '🐾 أسماء حيواناتك المفضلة' : '🐾 Name Your Farm Pets'}</span>
                  </h3>
                  {savedNotice && (
                    <span className="text-xs font-bold text-[#16a34a]">{savedNotice}</span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Dog Naming */}
                  <div className="rounded-xl bg-[#f7ebd2] border border-[#c9a574] p-3 space-y-2">
                    <div className="text-xs font-bold text-[#2c1e14] flex items-center justify-between">
                      <span>{isAr ? '🐕 كلب الحراسة' : '🐕 Guard Dog'}</span>
                      {!world.dog && (
                        <span className="text-[10px] text-[#8a5d36]">
                          {isAr ? '(اشتره من المتجر)' : '(Adopt in Shop)'}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        maxLength={14}
                        value={dogDraft}
                        onChange={(e) => setDogDraft(e.target.value)}
                        placeholder={isAr ? 'اسم الكلب...' : 'Dog name...'}
                        className="flex-1 min-w-0 min-h-[40px] px-2.5 py-1 rounded-lg bg-white border border-[#b58d5e] text-xs font-bold text-[#2c1e14] focus:outline-none focus:border-[#d97706]"
                      />
                      <button
                        type="button"
                        onClick={() => handleSavePetName('dog', dogDraft)}
                        className="wood-button-primary min-h-[40px] px-3 rounded-lg text-xs font-bold cursor-pointer shrink-0"
                      >
                        {isAr ? 'حفظ' : 'Save'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {PET_NAME_PRESETS.dog[sLang].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleSavePetName('dog', preset)}
                          className="px-2 py-1 rounded-md bg-white/80 hover:bg-[#fef3c7] border border-[#c9a574] text-[11px] font-semibold text-[#4a321f] cursor-pointer"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cat Naming */}
                  <div className="rounded-xl bg-[#f7ebd2] border border-[#c9a574] p-3 space-y-2">
                    <div className="text-xs font-bold text-[#2c1e14] flex items-center justify-between">
                      <span>{isAr ? '🐈 قط المزرعة' : '🐈 Barn Cat'}</span>
                      {!world.cat && (
                        <span className="text-[10px] text-[#8a5d36]">
                          {isAr ? '(اشتره من المتجر)' : '(Adopt in Shop)'}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        maxLength={14}
                        value={catDraft}
                        onChange={(e) => setCatDraft(e.target.value)}
                        placeholder={isAr ? 'اسم القط...' : 'Cat name...'}
                        className="flex-1 min-w-0 min-h-[40px] px-2.5 py-1 rounded-lg bg-white border border-[#b58d5e] text-xs font-bold text-[#2c1e14] focus:outline-none focus:border-[#16a34a]"
                      />
                      <button
                        type="button"
                        onClick={() => handleSavePetName('cat', catDraft)}
                        className="wood-button-primary min-h-[40px] px-3 rounded-lg text-xs font-bold cursor-pointer shrink-0"
                      >
                        {isAr ? 'حفظ' : 'Save'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {PET_NAME_PRESETS.cat[sLang].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleSavePetName('cat', preset)}
                          className="px-2 py-1 rounded-md bg-white/80 hover:bg-[#fef3c7] border border-[#c9a574] text-[11px] font-semibold text-[#4a321f] cursor-pointer"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'guide' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {HOW_TO_PLAY_CARDS.map((card) => (
                  <div
                    key={card.num}
                    className="rounded-xl border-2 border-[#b58d5e] bg-[#fdf5e2] p-3.5 shadow-sm flex items-start gap-3"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#4d331f] text-[#fde047] font-display font-bold text-lg flex items-center justify-center shrink-0">
                      {card.emoji}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display font-bold text-sm text-[#2c1e14] mb-0.5">
                        {card.num}. {card.title[sLang]}
                      </div>
                      <p className="text-xs text-[#5c4028] leading-relaxed">
                        {card.desc[sLang]}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-[#b58d5e] bg-[#f7ebd2] p-3.5">
                <div className="font-bold text-xs text-[#2c1e14] mb-2">
                  {isAr ? '⌨️ اختصارات سريعة (ويمكنك اللعب باللمس على الهاتف):' : '⌨️ Quick Controls (Touch Buttons Supported on Mobile):'}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-semibold text-[#4a321f]">
                  <div className="bg-white/75 rounded-lg px-2 py-1.5 border border-[#c9a574]">
                    <span className="font-mono-tabular font-bold text-[#9a3412]">WASD</span> · {isAr ? 'حركة' : 'Move'}
                  </div>
                  <div className="bg-white/75 rounded-lg px-2 py-1.5 border border-[#c9a574]">
                    <span className="font-mono-tabular font-bold text-[#9a3412]">Space</span> · {isAr ? 'أداة' : 'Use Tool'}
                  </div>
                  <div className="bg-white/75 rounded-lg px-2 py-1.5 border border-[#c9a574]">
                    <span className="font-mono-tabular font-bold text-[#9a3412]">E</span> · {isAr ? 'تفاعل' : 'Interact'}
                  </div>
                  <div className="bg-white/75 rounded-lg px-2 py-1.5 border border-[#c9a574]">
                    <span className="font-mono-tabular font-bold text-[#9a3412]">Y</span> · {isAr ? 'اندفاع' : 'Wind-Dash'}
                  </div>
                  <div className="bg-white/75 rounded-lg px-2 py-1.5 border border-[#c9a574]">
                    <span className="font-mono-tabular font-bold text-[#9a3412]">U</span> · {isAr ? 'المرح' : 'Fun Hub'}
                  </div>
                  <div className="bg-white/75 rounded-lg px-2 py-1.5 border border-[#c9a574]">
                    <span className="font-mono-tabular font-bold text-[#9a3412]">0</span> · {isAr ? 'تصوير' : 'Snapshot'}
                  </div>
                  <div className="bg-white/75 rounded-lg px-2 py-1.5 border border-[#c9a574]">
                    <span className="font-mono-tabular font-bold text-[#9a3412]">X</span> · {isAr ? 'البوابات' : 'Portals'}
                  </div>
                  <div className="bg-white/75 rounded-lg px-2 py-1.5 border border-[#c9a574]">
                    <span className="font-mono-tabular font-bold text-[#9a3412]">O</span> · {isAr ? 'القصة' : 'Story'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
