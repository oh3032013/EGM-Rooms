import type { FarmerHatId, FarmerOutfitId, FarmerStyle, ItemId } from './types';

export interface FarmerOutfitDef {
  id: FarmerOutfitId;
  shirt: string;
  overalls: string;
  accent: string;
  label: { ar: string; en: string };
}

export const FARMER_OUTFITS: FarmerOutfitDef[] = [
  {
    id: 'emerald',
    shirt: '#4ea84f',
    overalls: '#3b648f',
    accent: '#86efac',
    label: { ar: 'حارس الطبيعة', en: 'Emerald Ranger' },
  },
  {
    id: 'berry',
    shirt: '#e11d48',
    overalls: '#4c1d95',
    accent: '#fda4af',
    label: { ar: 'توت الصيف', en: 'Summer Berry' },
  },
  {
    id: 'sky',
    shirt: '#0284c7',
    overalls: '#1e3a8a',
    accent: '#7dd3fc',
    label: { ar: 'مستكشف السماء', en: 'Sky Explorer' },
  },
  {
    id: 'gold',
    shirt: '#d97706',
    overalls: '#78350f',
    accent: '#fde047',
    label: { ar: 'حصاد الشمس', en: 'Solar Gold' },
  },
  {
    id: 'midnight',
    shirt: '#7c3aed',
    overalls: '#1e293b',
    accent: '#c4b5fd',
    label: { ar: 'نجم الليل', en: 'Starlight' },
  },
];

export interface FarmerHatDef {
  id: FarmerHatId;
  label: { ar: string; en: string };
}

export const FARMER_HATS: FarmerHatDef[] = [
  { id: 'straw', label: { ar: 'قبعة القش', en: 'Straw Hat' } },
  { id: 'cap', label: { ar: 'كاب رياضي', en: 'Explorer Cap' } },
  { id: 'wizard', label: { ar: 'قبعة النجوم', en: 'Star Wizard' } },
  { id: 'crown', label: { ar: 'تاج الحصاد', en: 'Harvest Crown' } },
  { id: 'none', label: { ar: 'بدون قبعة', en: 'No Hat' } },
];

export const DEFAULT_FARMER_STYLE: FarmerStyle = {
  outfit: 'emerald',
  hat: 'straw',
};

const FARMER_STYLE_STORAGE_KEY = 'ecogrow_farmer_style_v1';

export function isValidFarmerOutfit(val: unknown): val is FarmerOutfitId {
  return FARMER_OUTFITS.some((o) => o.id === val);
}

export function isValidFarmerHat(val: unknown): val is FarmerHatId {
  return FARMER_HATS.some((h) => h.id === val);
}

export function normalizeFarmerStyle(raw: unknown): FarmerStyle {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FARMER_STYLE };
  const rec = raw as Record<string, unknown>;
  return {
    outfit: isValidFarmerOutfit(rec.outfit) ? rec.outfit : DEFAULT_FARMER_STYLE.outfit,
    hat: isValidFarmerHat(rec.hat) ? rec.hat : DEFAULT_FARMER_STYLE.hat,
  };
}

export function loadSavedFarmerStyle(): FarmerStyle {
  if (typeof window === 'undefined') return { ...DEFAULT_FARMER_STYLE };
  try {
    const raw = window.localStorage.getItem(FARMER_STYLE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FARMER_STYLE };
    return normalizeFarmerStyle(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_FARMER_STYLE };
  }
}

export function saveFarmerStyle(style: FarmerStyle): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FARMER_STYLE_STORAGE_KEY, JSON.stringify(normalizeFarmerStyle(style)));
  } catch {
    // Ignore storage quota errors
  }
}

export function getFarmerOutfitColors(style?: FarmerStyle): FarmerOutfitDef {
  const target = style?.outfit ?? DEFAULT_FARMER_STYLE.outfit;
  return FARMER_OUTFITS.find((o) => o.id === target) ?? FARMER_OUTFITS[0];
}

export function sanitizePetName(raw: string): string {
  const cleaned = String(raw ?? '')
    .replace(/[<>"'`\\/\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 14);
}

export const PET_NAME_PRESETS: {
  dog: { ar: string[]; en: string[] };
  cat: { ar: string[]; en: string[] };
} = {
  dog: {
    ar: ['بندق', 'رعد', 'صديق', 'بسكويت'],
    en: ['Rocky', 'Buddy', 'Dash', 'Biscuit'],
  },
  cat: {
    ar: ['سمسم', 'قمر', 'مشمش', 'نجمة'],
    en: ['Pixel', 'Sunny', 'Mochi', 'Sprout'],
  },
};

export interface LuckyWheelRewardDef {
  id: string;
  color: string;
  gold?: number;
  stamina?: number;
  item?: { id: ItemId; qty: number };
  label: { ar: string; en: string };
}

export const LUCKY_WHEEL_REWARDS: LuckyWheelRewardDef[] = [
  {
    id: 'gold_45',
    color: '#eab308',
    gold: 45,
    label: { ar: '+45 ذهب', en: '+45 Gold' },
  },
  {
    id: 'fertilizer_2',
    color: '#22c55e',
    item: { id: 'fertilizer', qty: 2 },
    label: { ar: 'سماد فوري ×2', en: '2× Fertilizer' },
  },
  {
    id: 'lavender_2',
    color: '#a855f7',
    item: { id: 'lavender_seed', qty: 2 },
    label: { ar: 'بذور خزامى ×2', en: '2× Lavender' },
  },
  {
    id: 'tea_stamina',
    color: '#06b6d4',
    stamina: 40,
    item: { id: 'herbal_tea', qty: 1 },
    label: { ar: 'شاي + طاقة', en: 'Tea + Stamina' },
  },
  {
    id: 'gold_85',
    color: '#f97316',
    gold: 85,
    label: { ar: '+85 ذهب!', en: '+85 Gold!' },
  },
  {
    id: 'koi_jackpot',
    color: '#ec4899',
    item: { id: 'golden_koi', qty: 1 },
    label: { ar: 'كوي ذهبية!', en: 'Golden Koi!' },
  },
];

export interface EcoQuizQuestion {
  id: string;
  question: { ar: string; en: string };
  choices: { ar: string[]; en: string[] };
  correctIndex: number;
  fact: { ar: string; en: string };
}

export const ECO_QUIZ_QUESTIONS: EcoQuizQuestion[] = [
  {
    id: 'bees_pollination',
    question: {
      ar: 'لماذا يُعد النحل بطلاً خارقاً للمزارعين؟',
      en: 'Why are honeybees real-life farming superheroes?',
    },
    choices: {
      ar: ['يلقّح الأزهار ليزيد المحصول', 'يحفر الآبار العميقة', 'يجلب العواصف الرعدية'],
      en: ['They pollinate flowers to boost harvests', 'They dig deep stone wells', 'They summon rainstorms'],
    },
    correctIndex: 0,
    fact: {
      ar: 'النحل ينقل حبوب اللقاح بين الأزهار مما يضاعف جودة وكمية الثمار!',
      en: 'Bees carry pollen between blossoms, boosting fruit and crop yields!',
    },
  },
  {
    id: 'crop_rotation',
    question: {
      ar: 'ماذا تفعل بقوليات الخصوبة (مثل الفول) للتربة؟',
      en: 'How do nitrogen-fixing beans help farm soil?',
    },
    choices: {
      ar: ['تُغني التربة بالنيتروجين للزرعة التالية', 'تجفف التربة تماماً', 'تجذب الخنازير البرية'],
      en: ['Enrich soil nitrogen for the next crop', 'Dry out the soil completely', 'Attract wild boars'],
    },
    correctIndex: 0,
    fact: {
      ar: 'تدوير المحاصيل مع الفول يعيد خصوبة التربة بشكل طبيعي ويزيد المحصول التالي +20%!',
      en: 'Rotating beans restores soil nutrients naturally and boosts the next harvest by +20%!',
    },
  },
  {
    id: 'drip_irrigation',
    question: {
      ar: 'ما أفضل طريقة لريّ صف كامل مع توفير الماء في الأيام الحارة؟',
      en: 'What is the smartest way to water a whole crop row while saving water?',
    },
    choices: {
      ar: ['الري بالتنقيط عند الجذور', 'سكب دلو ضخم في الهواء', 'السقي وقت الظهر تحت الشمس الحارقة'],
      en: ['Drip irrigation right at the roots', 'Splashing buckets into the air', 'Watering at scorching noon'],
    },
    correctIndex: 0,
    fact: {
      ar: 'الري بالتنقيط يوصل الماء مباشرة لجذور النبات ويقلل التبخر لأكثر من النصف!',
      en: 'Drip irrigation delivers water straight to roots, cutting evaporation in half!',
    },
  },
  {
    id: 'nasa_smap',
    question: {
      ar: 'ماذا يقيس قمر ناسا SMAP لمساعدة المزارعين حول العالم؟',
      en: 'What does NASA’s SMAP satellite measure to help farmers?',
    },
    choices: {
      ar: ['رطوبة التربة من الفضاء', 'عدد الدجاج في الحظيرة', 'سرعة نمو الفطر السحري'],
      en: ['Soil moisture from space', 'Chickens inside barns', 'Magic mushroom speed'],
    },
    correctIndex: 0,
    fact: {
      ar: 'قمر SMAP يرصد رطوبة التربة عالمياً للتنبؤ بالجفاف وتنظيم الزراعة!',
      en: 'NASA’s SMAP tracks global topsoil moisture to predict droughts and guide farming!',
    },
  },
  {
    id: 'bio_mulch',
    question: {
      ar: 'كيف يحمي المهاد الحيوي (Mulch) التربة أثناء الجفاف؟',
      en: 'How does organic mulch protect soil during dry days?',
    },
    choices: {
      ar: ['يحفظ الرطوبة ويغطي التربة من الشمس', 'يجلب الثلوج في الصيف', 'يحوّل القمح إلى صخور'],
      en: ['Locks in moisture and shades the soil', 'Creates snowstorms in summer', 'Turns wheat into rocks'],
    },
    correctIndex: 0,
    fact: {
      ar: 'تغطية التربة بالقش والأوراق تحافظ على برودة الجذور ورطوبة التربة لأيام!',
      en: 'Mulch blankets the soil to keep roots cool and hold moisture for days!',
    },
  },
  {
    id: 'greenhouse',
    question: {
      ar: 'لماذا تنمو المحاصيل داخل الصوبة الزجاجية حتى في الشتاء؟',
      en: 'Why can crops still thrive inside a Glass Greenhouse in Winter?',
    },
    choices: {
      ar: ['تحبس دفء الشمس وتحمي من الصقيع', 'تطفئ الشمس نهائياً', 'تمنع دخول الهواء والضوء'],
      en: ['It traps solar warmth & blocks frost', 'It turns off sunlight', 'It blocks all light out'],
    },
    correctIndex: 0,
    fact: {
      ar: 'الصوبة الزجاجية تسمح بدخول ضوء الشمس وتحتفظ بالدفء داخلها طوال اليوم!',
      en: 'Greenhouses let sunlight in while trapping cozy warmth inside against frost!',
    },
  },
  {
    id: 'rainwater',
    question: {
      ar: 'ما الفائدة الكبرى من خزان حصاد مياه الأمطار أثناء العواصف؟',
      en: 'Why capture rainwater in a Rain Tank during storms?',
    },
    choices: {
      ar: ['تخزين مياه مجانية نظيفة لأيام الجفاف', 'إغراق المزرعة بالماء', 'تغيير لون الغيوم'],
      en: ['Saves free fresh water for dry days', 'Floods the whole farm', 'Changes cloud colors'],
    },
    correctIndex: 0,
    fact: {
      ar: 'مياه الأمطار المخزنة خالية من الأملاح الزائدة وتُنقذ المحاصيل وقت الجفاف!',
      en: 'Stored rainwater gives plants salt-free hydration whenever drought strikes!',
    },
  },
  {
    id: 'owl_guardian',
    question: {
      ar: 'كيف تساعد البومة المزرعة في الطبيعة الحقيقية؟',
      en: 'How do barn owls help real farms at night?',
    },
    choices: {
      ar: ['تحرس الحقول من القوارض والآفات ليلاً', 'تأكل كل المحاصيل صباحاً', 'تحفر السياج الخشبي'],
      en: ['They guard fields from night pests', 'They eat all ripe crops', 'They chew wooden fences'],
    },
    correctIndex: 0,
    fact: {
      ar: 'تركيب عش للبومة في المزارع طريقة صديقة للبيئة لحماية المحاصيل بدون مبيدات!',
      en: 'Owl boxes are an eco-friendly way farmers protect crops without harsh chemicals!',
    },
  },
];

export function getDailyQuizForDay(day: number): { index: number; question: EcoQuizQuestion } {
  const index = Math.abs(Math.floor(day) - 1) % ECO_QUIZ_QUESTIONS.length;
  return { index, question: ECO_QUIZ_QUESTIONS[index] };
}

export interface HowToPlayStep {
  num: string;
  emoji: string;
  title: { ar: string; en: string };
  desc: { ar: string; en: string };
}

export const HOW_TO_PLAY_CARDS: HowToPlayStep[] = [
  {
    num: '1',
    emoji: '🌱',
    title: { ar: 'احرث، ازرع واسقِ', en: 'Till, Plant & Water' },
    desc: {
      ar: 'استخدم المجرفة (1) لتجهيز الأرض، ثم ازرع البذور واسقِها بالمرش (2) كل يوم!',
      en: 'Use the Hoe (1) to till grass, plant seeds from your hotbar, and water daily with Can (2)!',
    },
  },
  {
    num: '2',
    emoji: '⚡',
    title: { ar: 'اندفاع سريع وكنوز ليلية', en: 'Wind-Dash & Night Glow' },
    desc: {
      ar: 'اضغط Y للاندفاع السريع، اصطد اليراعات المضيئة ليلاً، وافتح صندوق الكنز اليومي بـ [E]!',
      en: 'Press Y to Wind-Dash! Catch glowing night fireflies and crack open the daily Mystery Chest with [E].',
    },
  },
  {
    num: '3',
    emoji: '🐾',
    title: { ar: 'حيوانات وأجهزة ذكية', en: 'Pets & Smart Gear' },
    desc: {
      ar: 'اشترِ دجاجاً وبقرة وكلب حراسة وقطاً، وضع مرشات شمسية وخلايا نحل لمضاعفة أرباحك!',
      en: 'Adopt chickens, cows, sheep, dog & cat! Craft sprinklers and beehives to automate & double harvests.',
    },
  },
  {
    num: '4',
    emoji: '🌌',
    title: { ar: 'افتح العوالم الأربعة', en: 'Unlock All 4 Realms' },
    desc: {
      ar: 'أتمم المهام لفتح البوابات، زُر القرى وتحدث مع الحكماء، واكشف أسرار المناطق الغريبة!',
      en: 'Complete missions to unlock Ancient Portals, visit Village Elders, and solve Strange Zones!',
    },
  },
];

export function captureFarmSnapshot(
  sourceCanvas: HTMLCanvasElement | null,
  meta: {
    day: number;
    seasonLabel: string;
    realmLabel: string;
    restorationPct: number;
    lang: 'ar' | 'en';
  }
): boolean {
  if (!sourceCanvas || typeof document === 'undefined') return false;
  try {
    const pad = 20;
    const footerH = 62;
    const out = document.createElement('canvas');
    out.width = sourceCanvas.width + pad * 2;
    out.height = sourceCanvas.height + pad * 2 + footerH;
    const ctx = out.getContext('2d');
    if (!ctx) return false;

    // Warm Polaroid / wooden scrapbook frame
    ctx.fillStyle = '#fdf3dc';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.strokeStyle = '#8b5e34';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, out.width - 6, out.height - 6);

    ctx.drawImage(sourceCanvas, pad, pad);
    ctx.strokeStyle = '#3d2817';
    ctx.lineWidth = 3;
    ctx.strokeRect(pad, pad, sourceCanvas.width, sourceCanvas.height);

    ctx.fillStyle = '#2c1e14';
    ctx.font = 'bold 20px "Pixelify Sans", "Cairo", sans-serif';
    ctx.textBaseline = 'middle';
    const titleText =
      meta.lang === 'ar'
        ? `EcoGrow Mission · ${meta.realmLabel}`
        : `EcoGrow Mission · ${meta.realmLabel}`;
    const subText =
      meta.lang === 'ar'
        ? `اليوم ${meta.day} (${meta.seasonLabel}) · استصلاح ${Math.round(meta.restorationPct)}%`
        : `Day ${meta.day} (${meta.seasonLabel}) · ${Math.round(meta.restorationPct)}% Restored`;

    ctx.textAlign = 'left';
    ctx.fillText(titleText, pad + 6, sourceCanvas.height + pad + 24);
    ctx.fillStyle = '#694d36';
    ctx.font = '600 15px "Plus Jakarta Sans", "Cairo", sans-serif';
    ctx.fillText(subText, pad + 6, sourceCanvas.height + pad + 48);

    const dataUrl = out.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `ecogrow-day-${meta.day}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    return false;
  }
}
