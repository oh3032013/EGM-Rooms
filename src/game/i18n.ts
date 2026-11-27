import type { ActionFeedback } from './rules';
import type {
  BadgeId,
  DaySummary,
  ItemId,
  MissionId,
  PlaceableType,
  RealmId,
  Season,
  WeatherType,
} from './types';
import { ITEMS } from './constants';
import {
  EXTRA_LOCALES,
  LANGUAGE_OPTIONS,
  type ExtraLanguage,
  type LanguageOption,
  type UiTextMap,
} from './localesExtra';

export type Language = 'en' | 'ar' | ExtraLanguage;
export { LANGUAGE_OPTIONS, type LanguageOption, type UiTextMap };

const LANG_STORAGE_KEY = 'ecogrow_lang';

const EXTRA_LANG_SET = new Set<string>(Object.keys(EXTRA_LOCALES));

export function isValidLanguage(code: string | null | undefined): code is Language {
  if (!code) return false;
  return code === 'en' || code === 'ar' || EXTRA_LANG_SET.has(code);
}

export function isRtlLanguage(lang: Language): boolean {
  return lang === 'ar';
}

export function getLanguageOption(lang: Language): LanguageOption {
  return LANGUAGE_OPTIONS.find((opt) => opt.code === lang) ?? LANGUAGE_OPTIONS[0];
}

export function getLanguageSwitchMessage(lang: Language): string {
  if (lang === 'ar') return 'تم التبديل إلى اللغة العربية';
  if (lang === 'en') return 'Switched to English';
  return EXTRA_LOCALES[lang].switchedMsg;
}

export function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'ar';
  const param = new URLSearchParams(window.location.search).get('lang');
  if (isValidLanguage(param)) return param;
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (isValidLanguage(stored)) return stored;
  } catch {
    // Ignore storage access errors
  }
  return 'ar';
}

export function saveLanguagePreference(lang: Language): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Ignore storage access errors
  }
}

export function formatTimeLocalized(timeMinutes: number, lang: Language): string {
  const clamped = Math.floor(timeMinutes) % 1440;
  const hrs24 = Math.floor(clamped / 60);
  const mins = Math.floor((clamped % 60) / 10) * 10;
  const hrs12 = hrs24 % 12 === 0 ? 12 : hrs24 % 12;
  let period: string;
  if (lang === 'ar') {
    period = hrs24 >= 12 ? 'م' : 'ص';
  } else if (lang === 'en') {
    period = hrs24 >= 12 ? 'PM' : 'AM';
  } else {
    const tp = EXTRA_LOCALES[lang].timePeriod;
    period = hrs24 >= 12 ? tp.pm : tp.am;
  }
  return `${hrs12}:${mins.toString().padStart(2, '0')} ${period}`;
}

export function translateSeason(season: Season, lang: Language): string {
  if (lang === 'en') return season;
  if (lang !== 'ar') return EXTRA_LOCALES[lang].seasons[season];
  switch (season) {
    case 'Spring':
      return 'الربيع';
    case 'Summer':
      return 'الصيف';
    case 'Autumn':
      return 'الخريف';
    case 'Winter':
      return 'الشتاء';
  }
}

export function translateWeather(weather: WeatherType, lang: Language): string {
  if (lang === 'en') return weather;
  if (lang !== 'ar') return EXTRA_LOCALES[lang].weathers[weather];
  switch (weather) {
    case 'Clear':
      return 'صحو';
    case 'Drought':
      return 'جفاف';
    case 'Rainstorm':
      return 'عاصفة';
    case 'Heatwave':
      return 'موجة حر';
  }
}

export const ITEM_AR: Record<
  ItemId,
  { name: string; description: string; roleClue: string }
> = {
  hoe: {
    name: 'مجرفة حديدية',
    description: 'تحرث العشب ليصبح تربة خصبة وتزيل المحاصيل الذابلة.',
    roleClue: 'حراثة التربة · -4 طاقة',
  },
  watering_can: {
    name: 'مرش المياه',
    description: 'يسقي المحاصيل المزروعة. أعد تعبئته من البئر الحجري.',
    roleClue: 'سقي المحاصيل · -3 طاقة',
  },
  axe: {
    name: 'فأس المزرعة',
    description: 'يزيل الأعشاب والصخور والجذوع، ويدفع الحيوانات البرية ليلاً.',
    roleClue: 'تنظيف / دفاع · -5 طاقة',
  },
  wheat_seed: {
    name: 'بذور القمح',
    description: 'حبوب سريعة النمو. تنضج خلال يومين.',
    roleClue: 'نمو يومين · بيع 26g',
  },
  carrot_seed: {
    name: 'بذور الجزر',
    description: 'جذور مغذية ومقرمشة. تنضج خلال 3 أيام.',
    roleClue: 'نمو 3 أيام · بيع 48g',
  },
  tomato_seed: {
    name: 'بذور الطماطم',
    description: 'ثمار صيفية لذيذة. تنضج خلال 4 أيام.',
    roleClue: 'نمو 4 أيام · بيع 78g',
  },
  strawberry_seed: {
    name: 'بذور الفراولة',
    description: 'توت حلو عالي القيمة. ينضج خلال 3 أيام.',
    roleClue: 'نمو 3 أيام · بيع 96g',
  },
  pumpkin_seed: {
    name: 'بذور اليقطين',
    description: 'ثمرة موسمية فاخرة تتحمل البرد. تنضج خلال 5 أيام.',
    roleClue: 'نمو 5 أيام · بيع 160g',
  },
  bean_seed: {
    name: 'بذور فول الخصوبة',
    description: 'محصول ربيعي وشتوي (3 أيام). يخصّب التربة لتعطي الزرعة التالية +20% إنتاجاً.',
    roleClue: 'نمو 3 أيام · +20% للزرعة التالية',
  },
  corn_seed: {
    name: 'بذور الذرة الذهبية',
    description: 'حبوب ذهبية سريعة تنمو خلال 3 أيام في الربيع والصيف والخريف.',
    roleClue: 'نمو 3 أيام · بيع 60g',
  },
  watermelon_seed: {
    name: 'بذور البطيخ الصيفي',
    description: 'بطيخ صيفي ضخم عالي القيمة ينضج خلال 5 أيام.',
    roleClue: 'نمو 5 أيام · بيع 135g',
  },
  lavender_seed: {
    name: 'بذور الخزامى العطرة',
    description: 'أزهار بنفسجية عطرة (4 أيام) تضاعف إنتاج العسل في خلايا النحل القريبة!',
    roleClue: 'نمو 4 أيام · +عسل إضافي',
  },
  sunflower_seed: {
    name: 'بذور عباد الشمس',
    description: 'أزهار صيفية وخريفية مبهجة (3 أيام) تجذب النحل وترفع فرص البذور عند الحصاد.',
    roleClue: 'نمو 3 أيام · +عسل وبذور',
  },
  potato_seed: {
    name: 'درنات البطاطس الذهبية',
    description: 'محصول مشبع (3 أيام) يمنح حبة إضافية في التربة المسقية أو المغطاة بالمهاد!',
    roleClue: 'نمو 3 أيام · +1 درنة عند السقي',
  },
  chili_seed: {
    name: 'بذور الفلفل الحار',
    description: 'فلفل قرمزي مقاوم للفيضان والأمطار (4 أيام) في الصيف والخريف.',
    roleClue: 'نمو 4 أيام · مقاوم للفيضان',
  },
  fertilizer: {
    name: 'سماد عضوي فوري',
    description: 'رُشّه على أي محصول مزروع لتسريع نموه يوماً كاملاً فوراً.',
    roleClue: '+1 يوم نمو فوراً',
  },
  bio_mulch: {
    name: 'مهاد حيوي عضوي',
    description: 'يغطي التربة المحروثة بطبقة قش تحفظ الرطوبة يومين وتحميها من الجفاف.',
    roleClue: 'درع رطوبة يومين',
  },
  fence: {
    name: 'سياج خشبي',
    description: 'يصد الأرانب ويبطئ الخنازير البرية ويحمي التربة المجاورة من الغمر.',
    roleClue: 'يصد الحيوانات',
  },
  scarecrow: {
    name: 'فزاعة الحقل',
    description: 'تبعد الأرانب وتبطئ الخنازير البرية ضمن نطاق 4 مربعات.',
    roleClue: 'حماية 4 مربعات',
  },
  lantern: {
    name: 'فانوس حجري',
    description: 'ينير الليل ويدفئ المحاصيل القريبة من الصقيع والعواصف.',
    roleClue: 'إضاءة ليلية + دفء',
  },
  flowerbed: {
    name: 'حوض زهور',
    description: 'زينة جميلة للمزرعة ترفع نسبة استصلاح الأرض.',
    roleClue: 'زينة بيئية',
  },
  stone_path: {
    name: 'ممر حجري',
    description: 'ممر مرتب يمنع نمو الأعشاب الضارة.',
    roleClue: 'ممر حديقة',
  },
  sprinkler: {
    name: 'مرشة شمسية ذكية',
    description: 'مرشة تعمل بالطاقة الشمسية تسقي التربة المحروثة حولها تلقائياً كل صباح.',
    roleClue: 'سقي تلقائي 3×3',
  },
  sensor: {
    name: 'حساس رطوبة التربة',
    description: 'حساس ذكي يمنع جفاف التربة ضمن 3.5 مربعات ويضاعف فرص البذور عند الحصاد.',
    roleClue: 'حماية من الجفاف + بذور',
  },
  compost: {
    name: 'صندوق السماد العضوي',
    description: 'يحول المخلفات الزراعية إلى سماد غني يسرّع نمو المحاصيل القريبة.',
    roleClue: 'تسريع النمو 2.2 مربع',
  },
  nasa_station: {
    name: 'محطة رصد ناسا',
    description: 'تعرض كل صباح رطوبة التربة والحرارة وتوقع مطر الغد.',
    roleClue: 'رصد صباحي + توقع الغد',
  },
  rain_tank: {
    name: 'خزان حصاد المطر',
    description: 'يخزّن ماء العاصفة (50 لتر) ويعطي 5 سقيات مجانية لمرشك.',
    roleClue: 'تخزين المطر · 5 سقيات مجانية',
  },
  shade_net: {
    name: 'شبكة ظل',
    description: 'تحمي مساحة 3×3 من ذبول المحاصيل في موجة الحر.',
    roleClue: 'حماية من موجة الحر 3×3',
  },
  drip_sprinkler: {
    name: 'مرشة تنقيط',
    description: 'تسقي صفاً كاملاً بنصف الماء وتوفّر لترات المياه.',
    roleClue: 'ري الصف · توفير المياه',
  },
  beehive: {
    name: 'خلية نحل المزرعة',
    description: 'تلقّح المحاصيل القريبة لمضاعفة الحصاد وتنتج عسلاً برياً كل صباح.',
    roleClue: 'عسل يومي + تلقيح المحاصيل',
  },
  cheese_press: {
    name: 'مكبس الجبن الحرفي',
    description: 'يحوّل الحليب الطازج إلى جبن فاخر (145g) كل صباح أو عند النقر.',
    roleClue: 'حليب ← جبن (145g)',
  },
  jam_maker: {
    name: 'صانعة مربى التوت',
    description: 'تطهى الفراولة إلى مربى شهي (175g) كل صباح أو عند النقر.',
    roleClue: 'فراولة ← مربى (175g)',
  },
  windmill: {
    name: 'طاحونة المزرعة الهوائية',
    description: 'طاحونة دوّارة تطحن الحبوب وتدرّ +18g دخلاً يومياً كل صباح.',
    roleClue: '+18g دخل يومي تلقائي',
  },
  wishing_fountain: {
    name: 'نافورة الأمنيات',
    description: 'ألقِ 10g مرة كل يوم لتنال بركة: ذهب، طاقة كاملة، طقس صحو، أو بذور نادرة!',
    roleClue: 'أمنية يومية (10g)',
  },
  greenhouse: {
    name: 'صوبة زجاجية ذكية (3×3)',
    description: 'قبة زجاجية تحمي 3×3 مربعات من الجفاف وموجات الحر والفيضان وتتيح النمو في الشتاء!',
    roleClue: 'زراعة شتوية + حماية 3×3',
  },
  owl_box: {
    name: 'عش البومة الحارسة',
    description: 'يستضيف بومة ليلية تصدّ تسلل الأرانب والخنازير تلقائياً مرة كل ليلة.',
    roleClue: 'صد غارة ليلية تلقائياً',
  },
  butter_churn: {
    name: 'مخضة الزبدة الخشبية',
    description: 'تخض الحليب الطازج إلى زبدة مزرعة ذهبية (130g) صباحاً أو عند النقر.',
    roleClue: 'حليب ← زبدة (130g)',
  },
  tea_kettle: {
    name: 'إبريق الشاي العشبي',
    description: 'يغلي الخزامى أو العسل لإعداد شاي أعشاب (+45 طاقة + سرعة فائقة).',
    roleClue: 'خزامى/عسل ← شاي سرعة',
  },
  egg: {
    name: 'بيض مزرعة طازج',
    description: 'تضعه دجاجات المزرعة كل صباح. تناوله لاستعادة +30 طاقة أو بِعه.',
    roleClue: 'بيع 38g · +30 طاقة',
  },
  honey: {
    name: 'عسل الأزهار البرية',
    description: 'عسل ذهبي تنتجه خلية النحل كل صباح. تناوله لاستعادة +35 طاقة و+15 صحة أو بِعه.',
    roleClue: 'بيع 65g · +35 طاقة',
  },
  milk: {
    name: 'حليب طازج',
    description: 'حليب كريمي من بقرة المزرعة. بِعه، اشربه (+40 طاقة)، أو اصنع منه جبناً وزبدة.',
    roleClue: 'بيع 75g · +40 طاقة',
  },
  wool: {
    name: 'صوف ناعم',
    description: 'صوف دافئ يُجمع كل صباح من خروف المزرعة.',
    roleClue: 'بيع 68g',
  },
  cheese: {
    name: 'جبن المزرعة الفاخر',
    description: 'جبن معتّق شهي. يمنح +55 طاقة و+30 صحة أو يُباع بسعر مرتفع.',
    roleClue: 'بيع 145g · +55 طاقة',
  },
  strawberry_jam: {
    name: 'مربى الفراولة الحرفي',
    description: 'مربى فاخر من فراولة المزرعة. يمنح +45 طاقة وقيمة بيع ممتازة.',
    roleClue: 'بيع 175g · +45 طاقة',
  },
  butter: {
    name: 'زبدة المزرعة الذهبية',
    description: 'زبدة غنية مخضوضة في المزرعة. تمنح +48 طاقة و+20 صحة أو تُباع بـ 130g.',
    roleClue: 'بيع 130g · +48 طاقة',
  },
  herbal_tea: {
    name: 'شاي الأعشاب المنشط',
    description: 'كوب ساخن يمنح +45 طاقة، +15 صحة، وتأثير السرعة (+25% سرعة و-1 طاقة للأدوات 3 ساعات).',
    roleClue: 'بيع 155g · تعزيز السرعة',
  },
  fish: {
    name: 'سمكة البركة الطازجة',
    description: 'تم اصطيادها من بركة المزرعة. تُباع بـ 52g أو تمنح +28 طاقة.',
    roleClue: 'بيع 52g · +28 طاقة',
  },
  golden_koi: {
    name: 'سمكة الكوي الذهبية',
    description: 'سمكة أسطورية نادرة من بركة المزرعة! تُباع بـ 220g أو تمنح +60 طاقة.',
    roleClue: 'بيع 220g · نادرة جداً',
  },
  wheat: {
    name: 'قمح ذهبي',
    description: 'حزمة قمح محصودة حديثاً.',
    roleClue: 'بيع 26g',
  },
  carrot: {
    name: 'جزر طازج',
    description: 'جزر حلو ومقرمش. تناوله لاستعادة +18 طاقة.',
    roleClue: 'بيع 48g · +18 طاقة',
  },
  tomato: {
    name: 'طماطم ناضجة',
    description: 'طماطم عصيرية. تناولها لاستعادة +22 طاقة.',
    roleClue: 'بيع 78g · +22 طاقة',
  },
  strawberry: {
    name: 'فراولة حلوة',
    description: 'فراولة عطرة. تناولها لاستعادة +26 طاقة.',
    roleClue: 'بيع 96g · +26 طاقة',
  },
  pumpkin: {
    name: 'يقطين الحصاد',
    description: 'يقطين كبير ذو قيمة سوقية عالية!',
    roleClue: 'بيع 160g · +35 طاقة',
  },
  bean: {
    name: 'فول الخصوبة',
    description: 'فول غني يثبت النيتروجين ويرفع محصول الزرعة التالية +20%.',
    roleClue: 'بيع 30g · +10 طاقة',
  },
  corn: {
    name: 'ذرة ذهبية',
    description: 'عرنوس ذرة ذهبي ناضج.',
    roleClue: 'بيع 60g · +16 طاقة',
  },
  watermelon: {
    name: 'بطيخ صيفي',
    description: 'بطيخ صيفي حلو وعالي القيمة في السوق!',
    roleClue: 'بيع 135g · +32 طاقة',
  },
  lavender: {
    name: 'خزامى عطرة',
    description: 'باقة خزامى بنفسجية محبوبة في القرية ولدى النحل.',
    roleClue: 'بيع 92g · +12 طاقة',
  },
  sunflower: {
    name: 'زهرة عباد الشمس',
    description: 'زهرة ذهبية لامعة محبوبة في القرية ولدى النحل.',
    roleClue: 'بيع 112g · +15 طاقة',
  },
  potato: {
    name: 'بطاطس ذهبية',
    description: 'درنات لذيذة تمنح +24 طاقة ومضاعفة عند السقي.',
    roleClue: 'بيع 54g · +24 طاقة',
  },
  chili: {
    name: 'فلفل أحمر حار',
    description: 'فلفل حار يقاوم العواصف ويمنح +20 طاقة.',
    roleClue: 'بيع 128g · +20 طاقة',
  },
  wood: {
    name: 'خشب طبيعي',
    description: 'يُجمع من تكسير الجذوع. يُستخدم في التصنيع.',
    roleClue: 'مادة تصنيع',
  },
  stone: {
    name: 'حجر الحقل',
    description: 'يُجمع من تكسير الصخور. يُستخدم للفوانيس والممرات.',
    roleClue: 'مادة تصنيع',
  },
};

export function getItemLabel(id: ItemId, lang: Language) {
  if (lang === 'ar') return ITEM_AR[id];
  if (lang !== 'en') return EXTRA_LOCALES[lang].items[id];
  const def = ITEMS[id];
  return {
    name: def.name,
    description: def.description,
    roleClue: def.roleClue,
  };
}

export function getRecipeLabel(
  id: PlaceableType | 'fertilizer' | 'bio_mulch',
  fallbackName: string,
  fallbackDesc: string,
  lang: Language
): { name: string; description: string } {
  if (lang === 'ar') {
    return RECIPE_AR[id] ?? { name: fallbackName, description: fallbackDesc };
  }
  if (lang !== 'en') {
    return EXTRA_LOCALES[lang].recipes[id] ?? { name: fallbackName, description: fallbackDesc };
  }
  return { name: fallbackName, description: fallbackDesc };
}

export const RECIPE_AR: Partial<Record<PlaceableType | 'fertilizer' | 'bio_mulch', { name: string; description: string }>> = {
  fence: {
    name: 'سياج خشبي (×2)',
    description: 'يمنع الأرانب ويبطئ الخنازير البرية ليلاً.',
  },
  scarecrow: {
    name: 'فزاعة الحقل',
    description: 'تحمي المحاصيل ضمن نطاق 4 مربعات من الحيوانات الليلية.',
  },
  lantern: {
    name: 'فانوس حجري',
    description: 'يضيء دافئاً في الليل ويحمي المحاصيل القريبة من الصقيع والفيضان.',
  },
  stone_path: {
    name: 'ممر حجري (×2)',
    description: 'ممر حجري أنيق لفناء المزرعة.',
  },
  flowerbed: {
    name: 'حوض زهور',
    description: 'يجمل المزرعة ويرفع نسبة الإعمار البيئي.',
  },
  sprinkler: {
    name: 'مرشة شمسية ذكية',
    description: 'تسقي التربة المحروثة حولها تلقائياً كل صباح بالطاقة الشمسية.',
  },
  sensor: {
    name: 'حساس رطوبة التربة',
    description: 'يحمي التربة القريبة من الجفاف ويزيد فرص سقوط البذور.',
  },
  compost: {
    name: 'صندوق السماد العضوي',
    description: 'يسرّع نمو المحاصيل المسقية ضمن نطاق 2.2 مربع.',
  },
  fertilizer: {
    name: 'سماد عضوي فوري (×2)',
    description: 'يسرّع نمو أي محصول مزروع بمقدار +1 يوم فوراً.',
  },
  bio_mulch: {
    name: 'مهاد حيوي عضوي (×2)',
    description: 'يغطي التربة المحروثة ليحفظ رطوبتها يومين كاملين ويحميها من الجفاف.',
  },
  owl_box: {
    name: 'عش البومة الحارسة',
    description: 'يصدّ غارة ليلية تلقائياً دون خسائر في المحاصيل.',
  },
  butter_churn: {
    name: 'مخضة الزبدة الخشبية',
    description: 'تخض الحليب الطازج إلى زبدة ذهبية فاخرة.',
  },
  tea_kettle: {
    name: 'إبريق الشاي العشبي',
    description: 'يعدّ شاي الأعشاب المنشط من الخزامى أو العسل.',
  },
  greenhouse: {
    name: 'صوبة زجاجية ذكية (3×3)',
    description: 'تحمي 3×3 مربعات من القسوة الجوية وتسمح بالزراعة في الشتاء.',
  },
  cheese_press: {
    name: 'مكبس الجبن الحرفي',
    description: 'يصنع جبن المزرعة الفاخر من الحليب الطازج.',
  },
  jam_maker: {
    name: 'صانعة مربى التوت',
    description: 'تطهى الفراولة لإنتاج مربى الفراولة الشهي.',
  },
};

const BASE_MISSION_TEXT: Record<
  MissionId,
  { en: { title: string; desc: string }; ar: { title: string; desc: string } }
> = {
  first_sow: {
    en: {
      title: 'First Green Sprouts',
      desc: 'Plant 4 seeds in tilled farm soil.',
    },
    ar: {
      title: 'البذور الخضراء الأولى',
      desc: 'ازرع 4 بذور في تربة محروثة.',
    },
  },
  eco_water: {
    en: {
      title: 'Morning Dew Keeper',
      desc: 'Water 6 tilled crop plots with your watering can.',
    },
    ar: {
      title: 'السقي المستدام',
      desc: 'اسقِ 6 مربعات مزروعة بمرش المياه.',
    },
  },
  land_steward: {
    en: {
      title: 'Land Steward',
      desc: 'Clear 6 weeds, rocks, or stumps from the field.',
    },
    ar: {
      title: 'استصلاح الأرض',
      desc: 'أزل 6 أعشاب أو صخور أو جذوع من الحقل.',
    },
  },
  first_harvest: {
    en: {
      title: 'Bountiful Basket',
      desc: 'Grow and harvest 3 ripe crops.',
    },
    ar: {
      title: 'الحصاد الأول',
      desc: 'ازرع واحصد 3 محاصيل ناضجة.',
    },
  },
  night_guard: {
    en: {
      title: 'Homestead Perimeter',
      desc: 'Place 4 fences, scarecrows, lanterns, or decor.',
    },
    ar: {
      title: 'حارس المزرعة الليلي',
      desc: 'ضع 4 أسيجة أو فزاعات أو فوانيس أو زينة.',
    },
  },
  soil_sensor: {
    en: {
      title: 'Smart Moisture Monitor',
      desc: 'Place 1 Eco Soil Sensor to protect crops from drought.',
    },
    ar: {
      title: 'مراقب رطوبة التربة',
      desc: 'ضع حساس رطوبة التربة لحماية محاصيلك من الجفاف.',
    },
  },
  smart_sprinkler: {
    en: {
      title: 'Solar Irrigation',
      desc: 'Place 1 Solar Auto-Sprinkler for automatic morning watering.',
    },
    ar: {
      title: 'الري الشمسي الذكي',
      desc: 'ضع مرشة شمسية ذكية لسقي التربة تلقائياً كل صباح.',
    },
  },
  happy_flock: {
    en: {
      title: 'Farmyard Flock',
      desc: 'Collect 3 Fresh Farm Eggs from adopted chickens.',
    },
    ar: {
      title: 'طيور المزرعة المنتجة',
      desc: 'اجمع 3 بيضات طازجة من دجاج المزرعة.',
    },
  },
  wild_defender: {
    en: {
      title: 'Night Watch',
      desc: 'Repel 2 prowling rabbits or boars with your axe.',
    },
    ar: {
      title: 'صدّ الحياة البرية',
      desc: 'أبعد حيوانين بريين متسللين ليلاً باستخدام الفأس.',
    },
  },
  market_trader: {
    en: {
      title: 'Eco-Market Trader',
      desc: 'Earn 250 Gold from harvests, quests, and defense.',
    },
    ar: {
      title: 'تاجر السوق البيئي',
      desc: 'اجمع 250 قطعة ذهبية من البيع والمهام.',
    },
  },
  climate_survivor: {
    en: {
      title: 'Weathering the Seasons',
      desc: 'Survive through Day 5 on your homestead.',
    },
    ar: {
      title: 'تحدي الفصول والمناخ',
      desc: 'واصل البقاء حتى اليوم الخامس في مزرعتك.',
    },
  },
  ecogrow_master: {
    en: {
      title: 'EcoGrow Mission Champion',
      desc: 'Reach 100% farm restoration progress.',
    },
    ar: {
      title: 'بطل مهمة EcoGrow',
      desc: 'أكمل استصلاح المزرعة بنسبة 100%.',
    },
  },
  nasa_install_station: {
    en: {
      title: '13. Install Weather Station',
      desc: 'Place 1 NASA Weather Station on your farm.',
    },
    ar: {
      title: '13. ركّب محطة الرصد',
      desc: 'ضع محطة رصد ناسا واحدة في مزرعتك.',
    },
  },
  nasa_grow_bean: {
    en: {
      title: '14. Fertility Bean Rotation',
      desc: 'Plant and harvest 1 Fertility Bean crop.',
    },
    ar: {
      title: '14. ازرع الفول واحصده',
      desc: 'ازرع فول الخصوبة واحصده لإغناء التربة.',
    },
  },
  nasa_rain_100l: {
    en: {
      title: '15. Capture 100L Rainwater',
      desc: 'Collect 100 liters of storm rainwater in Rainwater Tanks.',
    },
    ar: {
      title: '15. خزّن 100 لتر من ماء المطر',
      desc: 'خزّن 100 لتر من ماء العواصف عبر خزانات حصاد المطر.',
    },
  },
  nasa_heatwave_shade: {
    en: {
      title: '16. Heatwave Shield Master',
      desc: 'Survive a Heatwave with a Shade Net protecting crops and zero crop loss.',
    },
    ar: {
      title: '16. اجتز موجة الحر دون خسارة',
      desc: 'اجتز موجة حر بشبكة ظل تحمي محاصيلك دون ذبول أي محصول.',
    },
  },
  master_angler: {
    en: {
      title: '17. Pond Angler',
      desc: 'Catch 3 Fresh Pond Fish from the farm pond.',
    },
    ar: {
      title: '17. صياد البركة الماهر',
      desc: 'اصطد 3 أسماك طازجة من بركة المزرعة.',
    },
  },
  artisan_maker: {
    en: {
      title: '18. Homestead Artisan',
      desc: 'Produce 2 Artisan Cheeses or Berry Jams.',
    },
    ar: {
      title: '18. الحرفي المنتج',
      desc: 'أنتج قطعتين من الجبن الفاخر أو مربى الفراولة.',
    },
  },
  dairy_rancher: {
    en: {
      title: '19. Meadow Shepherd',
      desc: 'Adopt 1 Dairy Cow or Fluffy Sheep in the Village Shop.',
    },
    ar: {
      title: '19. راعي المراعي',
      desc: 'تبنّ بقرة حلوب أو خروفاً من سوق القرية.',
    },
  },
  veteran_farmer: {
    en: {
      title: '20. Veteran Homestead',
      desc: 'Reach Farmer Level 3 by harvesting, fishing, and defending.',
    },
    ar: {
      title: '20. المزارع الخبير',
      desc: 'اوصل لمستوى المزارع 3 عبر الحصاد والصيد والدفاع.',
    },
  },
  greenhouse_pioneer: {
    en: {
      title: '21. Greenhouse Pioneer',
      desc: 'Build & place 1 Glass Greenhouse (3×3) for all-season crops.',
    },
    ar: {
      title: '21. رائد الصوبة الذكية',
      desc: 'اصنع وضع صوبة زجاجية (3×3) للزراعة في جميع الفصول.',
    },
  },
  cat_lover: {
    en: {
      title: '22. Cozy Cat Companion',
      desc: 'Adopt 1 Cozy Barn Cat in the Village Shop.',
    },
    ar: {
      title: '22. صديق القط اللطيف',
      desc: 'تبنّ قط المزرعة اللطيف من متجر القرية.',
    },
  },
  tea_brewer: {
    en: {
      title: '23. Tea & Butter Artisan',
      desc: 'Craft 2 cups of Herbal Tea or Golden Farm Butter.',
    },
    ar: {
      title: '23. صانع الشاي والزبدة',
      desc: 'اصنع قطعتين من شاي الأعشاب أو زبدة المزرعة الذهبية.',
    },
  },
  titanium_smith: {
    en: {
      title: '24. Titanium Craftsmanship',
      desc: 'Upgrade any farm tool to Titanium Tier (Lv.4).',
    },
    ar: {
      title: '24. براعة التيتانيوم',
      desc: 'طوّر أي أداة زراعية إلى مستوى التيتانيوم (المستوى 4).',
    },
  },
  portal_awakener: {
    en: {
      title: '25. Ancient Gatekeeper',
      desc: 'Unlock your first new realm through the Ancient Portal.',
    },
    ar: {
      title: '25. حارس البوابات القديمة',
      desc: 'افتح أول عالم جديد عبر البوابة القديمة.',
    },
  },
  realm_voyager: {
    en: {
      title: '26. Voyager of Worlds',
      desc: 'Unlock and discover all 4 EcoGrow realms.',
    },
    ar: {
      title: '26. رحالة العوالم',
      desc: 'افتح واكتشف جميع عوالم EcoGrow الأربعة.',
    },
  },
  woods_village_visit: {
    en: {
      title: '27. Sylvan Oakwood Village',
      desc: 'Travel to Whispering Woods and speak with Elder Lyra.',
    },
    ar: {
      title: '27. زيارة قرية السنديان العتيق',
      desc: 'سافر إلى الغابة الهامسة وتحدّث مع الحكيمة ليرا.',
    },
  },
  woods_strange_zone: {
    en: {
      title: '28. The Whispering Monolith',
      desc: 'Investigate the glowing Strange Zone in Whispering Woods.',
    },
    ar: {
      title: '28. استكشاف المسلّة الهامسة',
      desc: 'افحص المنطقة الغريبة المتوهجة في الغابة الهامسة.',
    },
  },
  oasis_village_visit: {
    en: {
      title: '29. Mirage Caravan Village',
      desc: 'Visit Crystal Oasis village and meet Water-Sage Tariq.',
    },
    ar: {
      title: '29. قرية قافلة السراب',
      desc: 'قم بزيارة قرية واحة الكريستال وقابل الحكيم طارق.',
    },
  },
  oasis_strange_zone: {
    en: {
      title: '30. Pulsing Geode Rift',
      desc: 'Investigate the Crystal Strange Zone in Crystal Oasis.',
    },
    ar: {
      title: '30. صدع الكريستال النابض',
      desc: 'افحص المنطقة الغريبة المتوهجة في واحة الكريستال.',
    },
  },
  sky_sanctuary_expedition: {
    en: {
      title: '31. 2040 Astral Chronicle',
      desc: 'Meet Star-Keeper Orion or touch the 2040 Astral Rift in Sky Sanctuary.',
    },
    ar: {
      title: '31. عهد صدع الزمن ٢٠٢٠/٢٠٤٠',
      desc: 'قابل حارس النجوم أوريون أو المس مذبح صدع الزمن في ملاذ السماء.',
    },
  },
};

const BASE_BADGE_TEXT: Record<
  BadgeId,
  { en: { title: string; desc: string }; ar: { title: string; desc: string } }
> = {
  time_captain: {
    en: {
      title: 'Time Captain',
      desc: 'Complete NASA Missions 13–16.',
    },
    ar: {
      title: 'قبطان الزمن',
      desc: 'إتمام مهام ناسا 13–16.',
    },
  },
  water_guardian: {
    en: {
      title: 'Water Guardian',
      desc: 'Save 50 liters of irrigation water.',
    },
    ar: {
      title: 'حارس الماء',
      desc: 'توفير 50 لتراً من مياه الري.',
    },
  },
  soil_friend: {
    en: {
      title: 'Soil Friend',
      desc: 'Harvest Fertility Bean 3 times.',
    },
    ar: {
      title: 'صديق التربة',
      desc: 'حصد فول الخصوبة 3 مرات.',
    },
  },
  angler_pro: {
    en: {
      title: 'Pond Master',
      desc: 'Catch 5 Fresh Pond Fish.',
    },
    ar: {
      title: 'صياد البركة',
      desc: 'اصطياد 5 أسماك من البركة.',
    },
  },
  artisan_chef: {
    en: {
      title: 'Artisan Chef',
      desc: 'Craft 3 Artisan Cheeses or Jams.',
    },
    ar: {
      title: 'طاهي المزرعة',
      desc: 'إنتاج 3 قطع جبن أو مربى حرفي.',
    },
  },
  eco_architect: {
    en: {
      title: 'Eco Architect',
      desc: 'Place 1 Greenhouse or Owl Box on your farm.',
    },
    ar: {
      title: 'مهندس البيئة',
      desc: 'وضع صوبة زجاجية أو عش بومة في مزرعتك.',
    },
  },
  farm_tycoon: {
    en: {
      title: 'Farm Tycoon',
      desc: 'Earn 1,000 total Gold across your farm career.',
    },
    ar: {
      title: 'قطب المزرعة',
      desc: 'جمع 1,000 ذهب إجمالاً في مسيرتك الزراعية.',
    },
  },
  world_explorer: {
    en: {
      title: 'World Explorer',
      desc: 'Unlock all 4 realms via the Ancient World Portal.',
    },
    ar: {
      title: 'مستكشف العوالم',
      desc: 'افتح جميع العوالم الأربعة عبر بوابة العوالم القديمة.',
    },
  },
};

export const MISSION_TEXT: Record<
  MissionId,
  Record<Language, { title: string; desc: string }>
> = (Object.keys(BASE_MISSION_TEXT) as MissionId[]).reduce((acc, id) => {
  const entry = {
    en: BASE_MISSION_TEXT[id].en,
    ar: BASE_MISSION_TEXT[id].ar,
  } as Record<Language, { title: string; desc: string }>;
  for (const code of Object.keys(EXTRA_LOCALES) as ExtraLanguage[]) {
    entry[code] = EXTRA_LOCALES[code].missions[id] ?? BASE_MISSION_TEXT[id].en;
  }
  acc[id] = entry;
  return acc;
}, {} as Record<MissionId, Record<Language, { title: string; desc: string }>>);

export const BADGE_TEXT: Record<
  BadgeId,
  Record<Language, { title: string; desc: string }>
> = (Object.keys(BASE_BADGE_TEXT) as BadgeId[]).reduce((acc, id) => {
  const entry = {
    en: BASE_BADGE_TEXT[id].en,
    ar: BASE_BADGE_TEXT[id].ar,
  } as Record<Language, { title: string; desc: string }>;
  for (const code of Object.keys(EXTRA_LOCALES) as ExtraLanguage[]) {
    entry[code] = EXTRA_LOCALES[code].badges[id];
  }
  acc[id] = entry;
  return acc;
}, {} as Record<BadgeId, Record<Language, { title: string; desc: string }>>);

export function formatMorningSummaryText(summary: DaySummary, lang: Language): string {
  if (lang === 'en') return summary.message;
  if (lang !== 'ar') {
    const m = EXTRA_LOCALES[lang].morning;
    const notes: string[] = [];
    if (summary.cropsGrown > 0) notes.push(m.cropsGrown.replace('{n}', String(summary.cropsGrown)));
    if (summary.rainbowActive) notes.push(m.rainbow);
    if ((summary.sprinklerWatered ?? 0) > 0) {
      notes.push(m.sprinkler.replace('{n}', String(summary.sprinklerWatered)));
    }
    if ((summary.dripWatered ?? 0) > 0) {
      notes.push(
        m.drip
          .replace('{n}', String(summary.dripWatered))
          .replace('{l}', String(summary.waterSavedLiters ?? 0))
      );
    }
    if ((summary.rainCollectedLiters ?? 0) > 0) {
      notes.push(m.rain.replace('{l}', String(summary.rainCollectedLiters)));
    }
    if ((summary.eggsCollected ?? 0) > 0) notes.push(m.eggs.replace('{n}', String(summary.eggsCollected)));
    if ((summary.milkCollected ?? 0) > 0) notes.push(m.milk.replace('{n}', String(summary.milkCollected)));
    if ((summary.woolCollected ?? 0) > 0) notes.push(m.wool.replace('{n}', String(summary.woolCollected)));
    if ((summary.honeyCollected ?? 0) > 0) notes.push(m.honey.replace('{n}', String(summary.honeyCollected)));
    if ((summary.cheeseMade ?? 0) > 0) notes.push(m.cheese.replace('{n}', String(summary.cheeseMade)));
    if ((summary.jamMade ?? 0) > 0) notes.push(m.jam.replace('{n}', String(summary.jamMade)));
    if ((summary.butterMade ?? 0) > 0) notes.push(m.butter.replace('{n}', String(summary.butterMade)));
    if ((summary.teaMade ?? 0) > 0) notes.push(m.tea.replace('{n}', String(summary.teaMade)));
    if ((summary.windmillGold ?? 0) > 0) notes.push(m.windmill.replace('{n}', String(summary.windmillGold)));
    if ((summary.morningBonusGold ?? 0) > 0) notes.push(m.streakGold.replace('{n}', String(summary.morningBonusGold)));
    if ((summary.owlRepelled ?? 0) > 0) notes.push(m.owlSaved.replace('{n}', String(summary.owlRepelled)));
    if (summary.catGift) notes.push(m.catGift.replace('{gift}', summary.catGift));
    if (summary.cropsWithered > 0) notes.push(m.withered.replace('{n}', String(summary.cropsWithered)));
    if (summary.wildlifeDamage > 0) notes.push(m.wildlife.replace('{n}', String(summary.wildlifeDamage)));
    if (notes.length === 0) {
      notes.push(m.fallback.replace('{season}', translateSeason(summary.season, lang)));
    }
    return notes.join(' · ');
  }
  const notes: string[] = [];
  if (summary.cropsGrown > 0) notes.push(`نما ${summary.cropsGrown} محصول`);
  if (summary.rainbowActive) notes.push('صباح قوس قزح!');
  if ((summary.sprinklerWatered ?? 0) > 0) notes.push(`سقت المرشة ${summary.sprinklerWatered} تربة`);
  if ((summary.dripWatered ?? 0) > 0) {
    notes.push(`ري بالتنقيط ${summary.dripWatered} (وفّر ${summary.waterSavedLiters ?? 0} لتر)`);
  }
  if ((summary.rainCollectedLiters ?? 0) > 0) {
    notes.push(`تخزين ${summary.rainCollectedLiters} لتر مطر`);
  }
  if ((summary.eggsCollected ?? 0) > 0) notes.push(`+${summary.eggsCollected} بيض طازج`);
  if ((summary.milkCollected ?? 0) > 0) notes.push(`+${summary.milkCollected} حليب طازج`);
  if ((summary.woolCollected ?? 0) > 0) notes.push(`+${summary.woolCollected} صوف ناعم`);
  if ((summary.honeyCollected ?? 0) > 0) notes.push(`+${summary.honeyCollected} عسل بري`);
  if ((summary.cheeseMade ?? 0) > 0) notes.push(`+${summary.cheeseMade} جبن فاخر`);
  if ((summary.jamMade ?? 0) > 0) notes.push(`+${summary.jamMade} مربى توت`);
  if ((summary.butterMade ?? 0) > 0) notes.push(`+${summary.butterMade} زبدة ذهبية`);
  if ((summary.teaMade ?? 0) > 0) notes.push(`+${summary.teaMade} شاي أعشاب`);
  if ((summary.windmillGold ?? 0) > 0) notes.push(`+${summary.windmillGold}g دخل الطاحونة`);
  if ((summary.morningBonusGold ?? 0) > 0) notes.push(`+${summary.morningBonusGold}g مكافأة المواظبة`);
  if ((summary.owlRepelled ?? 0) > 0) notes.push(`البومة صدّت ${summary.owlRepelled} غارة`);
  if (summary.catGift) notes.push(`هدية القط: ${summary.catGift === 'fish' ? 'سمكة' : summary.catGift}`);
  if (summary.cropsWithered > 0) notes.push(`ذبل ${summary.cropsWithered}`);
  if (summary.wildlifeDamage > 0) notes.push(`أكلت الحيوانات ${summary.wildlifeDamage}`);
  if (notes.length === 0) {
    notes.push(`بدأ صباح جديد في فصل ${translateSeason(summary.season, 'ar')}`);
  }
  return notes.join(' · ');
}

export function formatFeedbackMessage(res: ActionFeedback, lang: Language): string | undefined {
  if (!res.message && res.kind !== 'harvest') return undefined;
  if (lang === 'en') return res.message;
  if (lang !== 'ar') {
    const pack = EXTRA_LOCALES[lang];
    const fb = pack.feedback;
    if (res.kind === 'harvest' && res.cropHarvested) {
      const cropName = pack.items[res.cropHarvested].name;
      if (res.goldenBonus) return fb.harvestBee.replace('{name}', cropName);
      return (res.rotationBoosted ? fb.harvestFert : fb.harvestPlain).replace('{name}', cropName);
    }
    if (!res.message) return undefined;
    if (fb.exact[res.message]) return fb.exact[res.message];
    if (res.message.startsWith('Wishing Fountain gifted +1 ')) {
      const raw = res.message.replace('Wishing Fountain gifted +1 ', '').replace('!', '');
      const match = (Object.keys(ITEMS) as ItemId[]).find((k) => ITEMS[k].name === raw);
      return match ? fb.wishingGift.replace('{name}', pack.items[match].name) : res.message;
    }
    if (res.message.startsWith('Drip row watered:')) {
      return res.message.replace('Drip row watered:', fb.dripRow);
    }
    if (res.message.startsWith('Placed ')) {
      const raw = res.message.replace('Placed ', '');
      const match = (Object.keys(ITEMS) as ItemId[]).find((k) => ITEMS[k].name === raw);
      return match ? fb.placed.replace('{name}', pack.items[match].name) : res.message;
    }
    return res.message;
  }

  if (res.kind === 'harvest' && res.cropHarvested) {
    if (res.goldenBonus) {
      return `+2 ${ITEM_AR[res.cropHarvested].name} (تلقيح النحل!)`;
    }
    return res.rotationBoosted
      ? `+1 ${ITEM_AR[res.cropHarvested].name} (+20% خصوبة!)`
      : `+1 ${ITEM_AR[res.cropHarvested].name}`;
  }
  switch (res.message) {
    case 'Move closer to reach that tile':
      return 'اقترب أكثر للوصول إلى هذا المربع';
    case 'Too exhausted! Rest or eat':
      return 'طاقتك نفدت! استرح أو تناول محصولاً';
    case 'Watering Can refilled':
      return 'تمت تعبئة مرش المياه';
    case 'Refilled from Rain Tank!':
      return 'تعبئة مجانية من خزان المطر!';
    case 'Watering Can is already full':
      return 'مرش المياه ممتلئ بالفعل';
    case 'Rain Tank is empty — wait for a Rainstorm':
      return 'خزان المطر فارغ — انتظر عاصفة مطرية';
    case 'Low Stamina — Rest at Farmhouse':
      return 'طاقة منخفضة — استرح في المنزل';
    case 'Cleared withered crop':
      return 'تمت إزالة المحصول الذابل';
    case 'Cleared weeds':
      return 'تمت إزالة الأعشاب';
    case 'Use Axe to clear rocks & stumps':
      return 'استخدم الفأس لتكسير الصخور والجذوع';
    case 'Can empty! Refill at the Well':
      return 'المرش فارغ! املأه من البئر';
    case 'Till soil first before watering':
      return 'احرث التربة بالمجرفة أولاً قبل السقي';
    case 'Repelled wildlife!':
      return 'تم صدّ الحيوان البري!';
    case '+3 Timber Wood':
      return '+3 خشب طبيعي';
    case '+2 Field Stone':
      return '+2 حجر الحقل';
    case 'Cleared weed (+1 Wood)':
      return 'إزالة عشب (+1 خشب)';
    case 'Repaired structure':
      return 'تم إصلاح البناء';
    case 'Till soil with Hoe first':
      return 'احرث التربة بالمجرفة أولاً';
    case 'A crop is already planted here':
      return 'يوجد محصول مزروع هنا بالفعل';
    case 'Out of seeds':
      return 'نفدت البذور';
    case 'Cannot build on this terrain':
      return 'لا يمكن البناء على هذه الأرض';
    case 'Tile is occupied':
      return 'هذا المربع مشغول';
    case 'Step off tile to build':
      return 'ابتعد عن المربع للبناء عليه';
    case 'None left in inventory':
      return 'لا توجد قطع متبقية في الحقيبة';
    case 'Caught Fresh Pond Fish!':
      return 'اصطدت سمكة بركة طازجة!';
    case 'Caught Pond Fish + Golden Pearl (+35g)!':
      return 'اصطدت سمكة + لؤلؤة ذهبية (+35g)!';
    case 'Pond ripples settling — wait a moment':
      return 'انتظر قليلاً حتى تهدأ تموجات البركة';
    case 'Fertilized crop (+1 growth day)!':
      return 'تسميد فوري (+1 يوم نمو)!';
    case 'Use Fertilizer on a growing crop':
      return 'استخدم السماد على محصول قيد النمو';
    case 'Crop is already ripe!':
      return 'المحصول ناضج بالفعل!';
    case 'Pressed 1 Artisan Cheese!':
      return 'تم عصر 1 جبن مزرعة فاخر!';
    case 'Need 1 Fresh Milk to press Cheese':
      return 'يلزم 1 حليب طازج لعصر الجبن';
    case 'Cooked 1 Berry Jam!':
      return 'تم طهي 1 مربى فراولة شهي!';
    case 'Need 1 Sweet Berry to make Jam':
      return 'يلزم 1 فراولة حلوة لصنع المربى';
    case 'Already made a wish today — return tomorrow':
      return 'تمنّيت أمنية اليوم بالفعل — عد غداً';
    case 'Need 10g to make a wish':
      return 'يلزم 10g لإلقاء عملة في النافورة';
    case 'Wishing Fountain blessed +35g!':
      return 'باركتك النافورة بـ +35g!';
    case 'Wishing Fountain restored Full Stamina!':
      return 'باركتك النافورة بطاقة كاملة!';
    case 'Wishing Fountain cleared the skies!':
      return 'بدّدت النافورة الغيوم إلى طقس صحو!';
    case 'Found Lucky Clover (+18g, +10 Stam)!':
      return 'جمعت نفل الحظ (+18g، +10 طاقة)!';
    case 'Found Autumn Mushroom (+18g, +10 Stam)!':
      return 'جمعت فطر الخريف النادر (+18g، +10 طاقة)!';
    case 'Found Frost Bloom (+18g, +10 Stam)!':
      return 'جمعت زهرة الصقيع (+18g، +10 طاقة)!';
    case 'Petted Guard Dog (+8 HP)!':
      return 'دلّلت كلب الحراسة (+8 صحة) ♥';
    case 'Petted Dairy Cow (+6 Stam)!':
      return 'دلّلت البقرة الحلوة (+6 طاقة) ♥';
    case 'Petted Fluffy Sheep (+6 Stam)!':
      return 'دلّلت الخروف الصوفي (+6 طاقة) ♥';
    case 'Petted Chicken (+4 Stam)!':
      return 'دلّلت الدجاجة (+4 طاقة) ♥';
    case 'Guard Dog wags tail!':
      return 'كلب الحراسة يهز ذيله بسعادة! ♥';
    case 'Dairy Cow moos happily!':
      return 'البقرة سعيدة باهتمامك! ♥';
    case 'Fluffy Sheep bleats happily!':
      return 'الخروف سعيد باهتمامك! ♥';
    case 'Chicken clucks happily!':
      return 'الدجاجة سعيدة باهتمامك! ♥';
    case 'Churned 1 Golden Farm Butter!':
      return 'تم خضّ 1 زبدة مزرعة ذهبية!';
    case 'Need 1 Fresh Milk to churn Butter':
      return 'يلزم 1 حليب طازج لخضّ الزبدة';
    case 'Brewed 1 Soothing Herbal Tea!':
      return 'تم تحضير 1 شاي أعشاب منشط!';
    case 'Need 1 Lavender or Honey to brew Tea':
      return 'يلزم 1 خزامى أو عسل لإعداد الشاي';
    case 'Caught Rare Golden Koi!':
      return 'اصطدت سمكة الكوي الذهبية النادرة!';
    case 'Reeled Sunken Chest (+45g & Seeds)!':
      return 'اصطدت صندوق كنز غارق (+45g وبذور)!';
    case 'Applied Bio-Mulch (2d moisture shield)!':
      return 'تم وضع المهاد الحيوي (حماية رطوبة يومين)!';
    case 'Apply Bio-Mulch on tilled soil':
      return 'استخدم المهاد الحيوي على تربة محروثة';
    case 'Out of Bio-Mulch':
      return 'نفد المهاد الحيوي';
    case 'Petted Cozy Barn Cat (+10 HP, +8 Stam)!':
      return 'دلّلت قط المزرعة (+10 صحة، +8 طاقة) ♥';
    case 'Barn Cat purrs happily!':
      return 'قط المزرعة يخرخر بسعادة! ♥';
    case '+5 Timber Wood (Forest Bonus)!':
      return '+5 خشب (مكافأة الغابة الهامسة)!';
    case '+2 Stone +8g Crystal Shard!':
      return '+2 حجر و +8g شظية كريستال!';
    case 'Crystal Shard! Caught Golden Koi!':
      return 'واحة الكريستال! اصطدت سمكة الكوي الذهبية!';
    case 'Reeled Crystal Oasis Pearl (+60g)!':
      return 'اصطدت لؤلؤة واحة الكريستال (+60g)!';
    default:
      if (res.message?.startsWith('Wishing Fountain gifted +1 ')) {
        const raw = res.message.replace('Wishing Fountain gifted +1 ', '').replace('!', '');
        const match = (Object.keys(ITEMS) as ItemId[]).find((k) => ITEMS[k].name === raw);
        return match ? `أهدتك النافورة +1 ${ITEM_AR[match].name}!` : res.message;
      }
      if (res.message?.startsWith('Drip row watered:')) {
        return res.message.replace('Drip row watered:', 'ري صف بالتنقيط:');
      }
      if (res.message?.startsWith('Placed ')) {
        const raw = res.message.replace('Placed ', '');
        const match = (Object.keys(ITEMS) as ItemId[]).find((k) => ITEMS[k].name === raw);
        return match ? `تم وضع ${ITEM_AR[match].name}` : res.message;
      }
      return res.message;
  }
}

const BASE_REALM_TEXT: Record<
  RealmId,
  { en: { name: string; desc: string; perk: string }; ar: { name: string; desc: string; perk: string } }
> = {
  homestead: {
    en: {
      name: 'Homestead Valley',
      desc: 'Your lush home farm valley with farmhouse, village shop, livestock pastures, and seasonal pond.',
      perk: 'Home Base · Farmhouse, Village Shop & Livestock',
    },
    ar: {
      name: 'وادي المزرعة',
      desc: 'مزرعتك الرئيسية الدافئة مع المنزل وسوق القرية والحيوانات وبركة الصيد.',
      perk: 'القاعدة الرئيسية · المنزل، السوق والحيوانات',
    },
  },
  whispering_woods: {
    en: {
      name: 'Whispering Woods',
      desc: 'Ancient emerald clearing rich with tall timber stumps, wild ferns, and mystic forest soil.',
      perk: '+2 Bonus Timber Wood per chopped stump',
    },
    ar: {
      name: 'الغابة الهامسة',
      desc: 'ساحة غابة زمردية عتيقة غنية بالأشجار والجذوع والأخشاب والنباتات البرية.',
      perk: '+2 خشب إضافي من كل جذع شجرة',
    },
  },
  crystal_oasis: {
    en: {
      name: 'Crystal Oasis',
      desc: 'Sun-drenched desert lagoon glittering with mineral rocks, crystal shards, and rare pond treasures.',
      perk: '+8g Crystal Shard per mined rock · Richer Oasis Fishing',
    },
    ar: {
      name: 'واحة الكريستال',
      desc: 'واحة صحراوية مشمسة تلمع بالصخور المعدنية وشظايا الكريستال وبحيرة الكنوز النادرة.',
      perk: '+8g كريستال من كل صخرة · صيد أغنى بالكنوز',
    },
  },
  sky_sanctuary: {
    en: {
      name: 'Sky Sanctuary',
      desc: 'Floating celestial garden above the clouds bathed in starlight—permanently sheltered from harsh weather.',
      perk: '2× Crop Growth · Auto-Watered · Immune to Storms, Heat & Beasts',
    },
    ar: {
      name: 'ملاذ السماء',
      desc: 'حديقة سماوية معلّقة فوق السحاب تغمرها النجوم ومحمية تماماً من العواصف والوحوش.',
      perk: 'نمو مضاعف 2× · ري ذاتي · مناعة من الطقس والوحوش',
    },
  },
};

export function getRealmLabel(
  id: RealmId,
  lang: Language
): { name: string; desc: string; perk: string } {
  if (lang === 'en') return BASE_REALM_TEXT[id].en;
  if (lang === 'ar') return BASE_REALM_TEXT[id].ar;
  return EXTRA_LOCALES[lang].realms[id];
}

export function getNearPromptLabel(
  action: 'sleep' | 'shop' | 'well' | 'bin' | 'portal' | 'elder' | 'strange_zone' | 'chest',
  lang: Language
): string {
  if (action === 'chest') {
    return lang === 'ar'
      ? 'اضغط E أو انقر لفتح صندوق الكنز اليومي'
      : 'Press E or Tap to Open Mystery Chest';
  }
  if (action === 'elder') {
    return lang === 'ar'
      ? 'اضغط E أو انقر للتحدث مع حكيم القرية'
      : 'Press E or Tap to Speak with Village Elder';
  }
  if (action === 'strange_zone') {
    return lang === 'ar'
      ? 'اضغط E أو انقر لفحص المنطقة الغريبة'
      : 'Press E or Tap to Investigate Strange Zone';
  }
  if (lang === 'en') {
    switch (action) {
      case 'sleep':
        return 'Press E or Tap to Sleep in Farmhouse';
      case 'shop':
        return 'Press E or Tap to Open Village Shop';
      case 'well':
        return 'Use Watering Can or E at Well to Refill';
      case 'bin':
        return 'Press E or Tap to Sell at Shipping Bin';
      case 'portal':
        return 'Press E or Tap to Open World Portals';
    }
  }
  if (lang !== 'ar') {
    return EXTRA_LOCALES[lang].nearPrompts[action];
  }
  switch (action) {
    case 'sleep':
      return 'اضغط E أو تفاعل للنوم في المنزل';
    case 'shop':
      return 'اضغط E أو تفاعل لفتح سوق القرية';
    case 'well':
      return 'املأ مرش المياه من البئر';
    case 'bin':
      return 'اضغط E أو تفاعل للبيع في الصندوق';
    case 'portal':
      return 'اضغط E أو تفاعل لفتح بوابة العوالم';
  }
}

const BASE_UI_TEXT: { en: UiTextMap; ar: UiTextMap } = {
  en: {
    brandTitle: 'EcoGrow Mission',
    saveYourFarm: 'Save Your Farm',
    startNow: 'Start Now',
    teamBtn: 'Preparation Team',
    exitBtn: 'Exit',
    teamTitle: 'Preparation Team — EcoGrow Mission',
    teamSubtitle: 'Meet the interdisciplinary team behind the EcoGrow Mission project.',
    exitTitle: 'See You Soon on the Farm!',
    exitBody: 'Your EcoGrow Mission progress is saved locally. You can close this tab or return to the main menu.',
    backToMenu: 'Back to Main Menu',
    tagline:
      'Restore an overgrown farm, complete EcoGrow farmer challenges, weather sudden storms, and guard your harvest through the night.',
    continueFarm: 'Continue Farm',
    newFarm: 'New Mission',
    startFarming: 'Start Mission',
    controlsDesktop:
      'WASD Move · Click Use Tool · 1-9 Select Slot · E Interact · J Missions · B Shop · C Craft · Esc Pause',
    controlsMobile:
      'D-Pad / Stick Move · Tap Tile or USE to Farm · Tap Hotbar to Switch Tools',
    langSwitch: 'العربية',
    restored: 'Restored',
    lowStam: 'Low Stam',
    rest: 'Rest',
    dayWord: 'Day',
    nightWarning: 'Nightfall — Wildlife prowling!',
    emptySlot: 'Empty Slot',
    ok: 'OK',
    shop: 'Shop',
    craft: 'Craft',
    missions: 'Missions',
    droughtHit: 'Midday drought dried out watered soil!',
    stormProtectionHint: 'Rainstorm! Fences & lanterns shield nearby crops.',
    staminaLowHint: 'Stamina low — rest at Farmhouse or eat a crop!',
    exhaustedToast: 'You collapsed from exhaustion in the field!',
    missionClaimed: 'Mission Reward Claimed!',
    missionsModalTitle: 'EcoGrow Farmer Challenges',
    missionsModalSub: 'Complete farm milestones to earn Gold, bonus seeds, and supplies.',
    completedCount: 'Completed',
    claimReward: 'Claim Reward',
    claimed: 'Claimed',
    inProgress: 'In Progress',
    rewardLabel: 'Reward',
    staminaBonus: '+{n} Stam',
    shopTitle: 'Village Market Stall',
    shopSub: '{season} Market · In-season crops sell for +25% bonus Gold',
    seedsTab: 'Seeds & Supplies',
    sellTab: 'Sell Harvest',
    upgradesTab: 'Tools & Decor',
    inSeason: '· In Season',
    owned: 'Owned',
    buy1: 'Buy 1',
    buy: 'Buy',
    emptyBasket: 'Your harvest basket is empty. Grow and harvest crops on your farm to sell them here!',
    seasonBonus: '+25% Season Bonus',
    sellsFor: 'Sells for',
    each: 'each',
    sell1: 'Sell 1',
    sellAll: 'Sell All',
    toolUpgrades: 'Tool Upgrades',
    defensesDecor: 'Defenses & Cozy Decorations',
    tierIron: 'Iron Tier',
    tierCopper: 'Copper Tier',
    tierMaster: 'Master Tier',
    maxTier: 'Max Tier',
    upgrade: 'Upgrade',
    hoeName: 'Homestead Hoe',
    hoeBenefit: '-1 Stamina cost per till',
    canName: 'Watering Can',
    canBenefit: 'Larger tank & -1 Stamina',
    axeName: 'Homestead Axe',
    axeBenefit: '+1 Wildlife damage & -1 Stamina',
    craftTitle: 'EcoGrow Workbench',
    wood: 'Wood',
    stone: 'Stone',
    gold: 'Gold',
    craftTab: 'Craft Defenses & Decor',
    satchelTab: 'Satchel & Hotbar',
    requires: 'Requires',
    craftBtn: 'Craft',
    assignSlot: 'Assign {name} to Hotbar Slot:',
    cancel: 'Cancel',
    eatBtn: 'Eat',
    moveBtn: 'Move',
    equipBtn: 'Equip',
    pausedTitle: 'Mission Paused',
    pausedSub: 'Your farm is safe while you catch your breath.',
    restoredTitle: 'EcoGrow Restored!',
    restoredSub: 'Your farm is flourishing at 100%! Keep completing challenges endlessly or start anew.',
    exhaustedTitle: 'Exhausted in the Field',
    exhaustedSub: 'You collapsed before reaching the farmhouse. Rest well and begin again.',
    daysStat: 'Days',
    harvestedStat: 'Harvested',
    restoredStat: 'Restored',
    touchControlsLabel: 'Phone Buttons',
    on: 'On',
    off: 'Off',
    languageLabel: 'Language',
    resume: 'Resume',
    continueFarming: 'Continue Farming',
    tryAgain: 'Try Again',
    restartMission: 'New Farm',
    titleScreen: 'Title Screen',
    installAndroid: 'Install on Android',
    addToIphone: 'Add to iPhone',
    installTitleAndroid: 'Install on Android',
    installTitleIOS: 'Install on iPhone / iPad',
    offlineBanner: 'Offline Mode · Local Farm Save Active',
    gotIt: 'Got it',
    dpadLabel: 'D-Pad',
    stickLabel: 'Stick',
    actLabel: 'ACT',
    useLabel: 'USE',
    livestockHeader: 'Eco Livestock & Tech',
    chickenName: 'Farmyard Chicken',
    chickenDesc: 'Wanders your homestead and lays 1 Fresh Egg every morning (sell 38g or eat +30 Stam).',
    adoptChicken: 'Adopt',
    coopFull: 'Flock Full',
    fullscreenBtn: 'Fullscreen',
    exitFullscreenBtn: 'Exit Fullscreen',
    rotateLandscapeHint: 'Rotate or switch to Landscape for best mobile play',
    enableLandscapeBtn: 'Go Landscape',
    blindModeBtn: 'Blind Mode',
    blindModeOn: 'Blind Mode: On',
    blindModeOff: 'Blind Mode: Off',
    blindScanBtn: 'Scan (F)',
    blindGuideBtn: 'Guide (G)',
    blindStatusBtn: 'Status (R)',
    nasaBtn: 'NASA',
    nasaModalTitle: 'NASA Observatory',
    nasaModalSub: 'Earth-observation satellites supporting sustainable farming',
    nasaDisclaimer:
      'Educational info only: In-game weather is simulated locally and does not read live NASA satellite feeds.',
    nasaStationTelemetryTitle: 'Your Farm Weather Station Report',
    nasaNoStationHint:
      'Tip: Buy and place the NASA Weather Station (150g) in the Shop to view morning soil moisture, temperature & tomorrow’s forecast!',
    soilMoistureLabel: 'Soil Moisture',
    tempLabel: 'Temperature',
    tomorrowLabel: 'Tomorrow',
    futureMsgTitle: 'Message from 2040',
    futureMsgSub: 'Transmission from a future farmer · Day {day}',
    futureMsgDismiss: 'Message Received',
    waterSavedLabel: 'Water Saved',
    litersUnit: 'L',
    coreMissionsHeader: 'Homestead Missions (1–12)',
    nasaMissionsHeader: 'NASA Missions (13–16 · Optional)',
    badgesHeader: 'Achievement Badges',
    unlockedBadge: 'Unlocked',
    lockedBadge: 'Locked',
    badgeUnlockedToast: 'Badge Unlocked!',
    heatwaveHit: 'Heatwave peak! Protect berries & tomatoes with a Shade Net!',
    rainCollectedToast: 'Rain Tank captured +50L storm water!',
    controlsDesktopNasa: 'N NASA',
    dailyOrderTitle: 'Daily Village Order',
    dailyOrderSub: 'Deliver requested harvest for bonus Gold & Stamina',
    deliverOrderBtn: 'Deliver Order',
    orderDoneLabel: 'Delivered!',
    orderReadyHud: 'Order Ready!',
    sprintBtn: 'Sprint (Shift)',
    comboToast: 'Harvest Streak x{n} (+{g}g)',
    treasureGoldToast: 'Lucky Soil Treasure! +{g}g',
    treasureSeedToast: 'Lucky Find! +1 {seed}',
    goldenHarvestToast: 'Bee Pollination Double!',
    almanacBtn: 'Almanac',
    almanacTitle: 'Homestead Almanac & Leveling',
    almanacSub: 'Discovered crops, artisan goods, pond fish, and market demand',
    farmerLevelLabel: 'Farmer Lv.{n}',
    xpLabel: 'Experience',
    marketSurgeLabel: "Today's Market Surge (+50%)",
    marketSurgeBadge: '+50% Market Surge',
    discoveredLabel: 'Discovered',
    cowName: 'Dairy Cow',
    cowDesc: 'Grazes your pasture and produces 1 Fresh Milk every morning (sell 75g or press into Cheese).',
    sheepName: 'Fluffy Sheep',
    sheepDesc: 'Wanders your homestead and yields 1 Soft Wool every morning (sell 68g).',
    dogName: 'Loyal Guard Dog',
    dogDesc: 'Patrols your farm and automatically barks to chase away nighttime rabbits and boars!',
    extendedMissionsHeader: 'Artisan, Ranch & Angler Goals (17–20)',
    levelUpToast: 'Level Up! Lv.{n} (+5 Max Stamina)',
    dogBarkToast: 'Woof! Guard Dog repelled prowler!',
    almanacCropsTab: 'Crops & Produce',
    almanacArtisanTab: 'Artisan & Pond',
    singleplayerBtn: 'Singleplayer',
    continueSingleplayer: 'Continue Solo Farm',
    multiplayerRoomsBtn: 'Rooms Multiplayer',
    roomsModalTitle: 'Co-op Farm Rooms',
    roomsModalSub: 'Create a shared farm room or join friends with a room code (up to 4 players)',
    playerNameLabel: 'Farmer Name',
    playerNamePlaceholder: 'Enter your name...',
    createRoomTab: 'Create Room',
    joinRoomTab: 'Join / Browse Rooms',
    roomNameLabel: 'Room Name',
    roomNamePlaceholder: 'e.g. Green Valley Co-op',
    publicRoomLabel: 'Public Room (visible in lobby list)',
    privateRoomLabel: 'Private Room (code only)',
    createAndPlayBtn: 'Create & Enter Room',
    joinByCodeLabel: 'Join by Room Code',
    roomCodePlaceholder: '6-char code (e.g. ECO482)',
    joinRoomBtn: 'Join Room',
    publicRoomsHeader: 'Open Public Rooms',
    refreshRoomsBtn: 'Refresh',
    noPublicRooms: 'No public rooms open yet — create one to start farming together!',
    playersCountLabel: '{n}/4 Farmers',
    hostLabel: 'Host',
    roomBadgeLabel: 'Room',
    copyCodeBtn: 'Copy Code',
    codeCopiedToast: 'Room code copied!',
    copyLinkBtn: 'Copy Link',
    linkCopiedToast: 'Invite link copied!',
    leaveRoomBtn: 'Leave Room',
    chatBtn: 'Chat (T)',
    chatPlaceholder: 'Message your farm team...',
    noChatYet: 'No messages yet — say hi to your farm team!',
    sendChatBtn: 'Send',
    sleepVoteReady: 'Rest Vote ({ready}/{total})',
    sleepVoteWaiting: 'Waiting for {left} farmer(s) to rest...',
    sleepReadyBtn: 'Sleep Ready',
    sleepCancelBtn: 'Cancel',
    playerJoinedToast: '{name} joined the farm!',
    playerLeftToast: '{name} left the farm',
    reconnectingToast: 'Reconnecting to room...',
    roomErrorNotFound: 'Room code not found. Check the code and try again.',
    roomErrorFull: 'This room is already full (Max 4 farmers).',
    roomErrorConnect: 'Could not connect to multiplayer server.',
    roomErrorClosed: 'The room closed or the server restarted.',
    roomErrorTimeout: 'Connection timed out. Please check the server and try again.',
    customServerLabel: 'Multiplayer Server URL (Optional)',
    customServerHint: 'Leave empty to use this site’s server. Useful for APK / EXE / Vercel.',
    serverDefaultBtn: 'Use Default',
    voiceJoinBtn: 'Voice (V)',
    voiceLeaveBtn: 'Leave Voice',
    voiceMicOnBtn: 'Mute Mic (V)',
    voiceMicOffBtn: 'Unmute Mic (V)',
    voiceDeafenBtn: 'Mute Voice Audio',
    voiceUndeafenBtn: 'Unmute Voice Audio',
    voiceActiveLabel: 'Voice Live',
    voiceSpeakingLabel: 'Speaking',
    voiceMutedLabel: 'Muted',
    voiceErrorPermission: 'Microphone permission denied. Allow mic access to talk.',
    voiceErrorUnsupported: 'Voice chat requires HTTPS and WebRTC browser support.',
    voiceListenOnlyToast: 'No microphone found — joined in listen-only mode.',
    voiceMutePeerBtn: 'Mute player',
    voiceUnmutePeerBtn: 'Unmute player',
    forceUpdateTitle: 'Required Update Available',
    forceUpdateSubtitle: 'Please update EcoGrow Mission to keep playing and join rooms.',
    forceUpdateCurrentVer: 'Your Version',
    forceUpdateRequiredVer: 'Required',
    forceUpdateLatestVer: 'Latest',
    forceUpdateBtn: 'Update Now',
    forceUpdateRecheckBtn: 'Re-check',
    forceUpdateChecking: 'Checking...',
    forceUpdateOfflineRetry: 'Unable to reach update server. Check your connection and retry later.',
    forceUpdateSaveSafe: 'Your local singleplayer farm save remains safely preserved.',
    forceUpdateDownloading: 'Downloading only changed files...',
    forceUpdateProgressFiles: '{done}/{total} changed files ({skipped} unchanged)',
    forceUpdateServerOnlyMsg: 'Server connection & configuration updated right here!',
    forceUpdateModeServerOnly: 'Server-only update (no game files to download)',
    forceUpdateModeDelta: 'Smart delta update (downloads changed files only)',
    forceUpdateReadyReload: 'Update applied! Reloading inside this window...',
    tierTitanium: 'Titanium Tier',
    catName: 'Cozy Barn Cat',
    catDesc: 'Purrs around your farm, restores +10 HP & +8 Stam when petted, and brings morning gifts!',
    quickEatBtn: 'Quick Eat (Q)',
    miniMapBtn: 'Map (Z)',
    miniMapTitle: 'Farm Radar Map',
    swiftBuffBadge: 'Swift Brew',
    streakBadge: 'Day {n} (+{g}g)',
    almanacStatsTab: 'Farm Records',
    portalsBtn: 'Realms',
    portalModalTitle: 'Ancient World Portals',
    portalModalSub: 'Unlock and travel to new fertile lands, crystal oases, and floating sky gardens',
    travelBtn: 'Travel',
    unlockRealmBtn: 'Unlock Realm',
    currentRealmBadge: 'Current Realm',
    unlockedLabel: 'Discovered',
    lockedLabel: 'Sealed',
    realmArrivalToast: 'Arrived in {realm}!',
  },
  ar: {
    brandTitle: 'EcoGrow Mission',
    saveYourFarm: 'أنقذ مزرعتك',
    startNow: 'ابدأ الآن',
    teamBtn: 'فريق الاعداد',
    exitBtn: 'الخروج',
    teamTitle: 'فريق الإعداد — EcoGrow Mission',
    teamSubtitle: 'أعضاء فريق العمل القائمون على البحث والتطوير وتنفيذ مشروع EcoGrow Mission.',
    exitTitle: 'إلى اللقاء في المزرعة!',
    exitBody: 'تم حفظ تقدمك في EcoGrow Mission محلياً. يمكنك إغلاق التطبيق أو العودة إلى الواجهة الرئيسية.',
    backToMenu: 'العودة للواجهة الرئيسية',
    tagline:
      'أعد إعمار المزرعة المهجورة، وأكمل تحديات المزارع في EcoGrow، وواجه العواصف والجفاف، واحمِ محاصيلك ليلاً.',
    continueFarm: 'متابعة المزرعة',
    newFarm: 'مهمة جديدة',
    startFarming: 'ابدأ المهمة',
    controlsDesktop:
      'WASD للحركة · النقر للأداة · 1-9 شريط الأدوات · E تفاعل · J التحديات · B المتجر · C التصنيع · L الموسوعة · Esc إيقاف',
    controlsMobile:
      'أزرار الأسهم أو العصا للحركة · زر USE للزراعة والحصاد · اضغط على الشريط لتبديل الأدوات',
    langSwitch: 'English',
    restored: 'استصلاح',
    lowStam: 'طاقة منخفضة',
    rest: 'راحة',
    dayWord: 'اليوم',
    nightWarning: 'حلول الليل — حيوانات برية متسللة!',
    emptySlot: 'خانة فارغة',
    ok: 'حسناً',
    shop: 'المتجر',
    craft: 'التصنيع',
    missions: 'التحديات',
    droughtHit: 'جفاف منتصف النهار جفّف التربة المسقية!',
    stormProtectionHint: 'عاصفة مطرية! الأسيجة والفوانيس تحمي المحاصيل القريبة.',
    staminaLowHint: 'طاقتك منخفضة — استرح في المنزل أو تناول محصولاً!',
    exhaustedToast: 'سقطت من الإرهاق في الحقل!',
    missionClaimed: 'تم استلام مكافأة التحدي!',
    missionsModalTitle: 'تحديات المزارع — EcoGrow',
    missionsModalSub: 'أنجز مهام المزرعة لربح الذهب والبذور المجانية والمواد.',
    completedCount: 'مكتمل',
    claimReward: 'استلام المكافأة',
    claimed: 'تم الاستلام',
    inProgress: 'قيد التنفيذ',
    rewardLabel: 'المكافأة',
    staminaBonus: '+{n} طاقة',
    shopTitle: 'سوق القرية',
    shopSub: 'سوق {season} · المحاصيل الموسمية تُباع بمكافأة +25% ذهب',
    seedsTab: 'البذور والإمدادات',
    sellTab: 'بيع الحصاد',
    upgradesTab: 'الأدوات والزينة',
    inSeason: '· موسمي',
    owned: 'لديك',
    buy1: 'شراء 1',
    buy: 'شراء',
    emptyBasket: 'سلة الحصاد فارغة. ازرع المحاصيل واحصدها ثم عد لبيعها هنا!',
    seasonBonus: '+25% مكافأة الموسم',
    sellsFor: 'سعر البيع',
    each: 'للواحدة',
    sell1: 'بيع 1',
    sellAll: 'بيع الكل',
    toolUpgrades: 'ترقية الأدوات',
    defensesDecor: 'الدفاعات والزينة البيئية',
    tierIron: 'المستوى الحديدي',
    tierCopper: 'المستوى النحاسي',
    tierMaster: 'المستوى المتقن',
    maxTier: 'أعلى مستوى',
    upgrade: 'ترقية',
    hoeName: 'مجرفة المزرعة',
    hoeBenefit: '-1 تكلفة طاقة لكل حراثة (ومربع إضافي بالمستوى 3)',
    canName: 'مرش المياه',
    canBenefit: 'خزان أكبر و -1 طاقة (وسقي مربعين بالمستوى 3)',
    axeName: 'فأس المزرعة',
    axeBenefit: '+1 ضرر للحيوانات و -1 طاقة',
    craftTitle: 'طاولة التصنيع والحقيبة',
    wood: 'خشب',
    stone: 'حجر',
    gold: 'ذهب',
    craftTab: 'صناعة الدفاعات والزينة',
    satchelTab: 'الحقيبة وشريط الأدوات',
    requires: 'يتطلب',
    craftBtn: 'صناعة',
    assignSlot: 'تعيين {name} إلى الخانة:',
    cancel: 'إلغاء',
    eatBtn: 'تناول',
    moveBtn: 'نقل',
    equipBtn: 'تجهيز',
    pausedTitle: 'اللعبة متوقفة مؤقتاً',
    pausedSub: 'مزرعتك بأمان أثناء استراحتك.',
    restoredTitle: 'تم إعمار EcoGrow!',
    restoredSub: 'مزرعتك مزدهرة بنسبة 100%! يمكنك متابعة التحديات أو بدء مزرعة جديدة.',
    exhaustedTitle: 'نفدت طاقتك في الحقل',
    exhaustedSub: 'انهرت قبل الوصول للمنزل. استرح جيداً وابدأ من جديد.',
    daysStat: 'الأيام',
    harvestedStat: 'الحصاد',
    restoredStat: 'الاستصلاح',
    touchControlsLabel: 'أزرار الهاتف',
    on: 'مفعّلة',
    off: 'معطّلة',
    languageLabel: 'اللغة',
    resume: 'استئناف اللعب',
    continueFarming: 'متابعة الزراعة',
    tryAgain: 'حاول مجدداً',
    restartMission: 'مزرعة جديدة',
    titleScreen: 'الشاشة الرئيسية',
    installAndroid: 'تثبيت على أندرويد',
    addToIphone: 'إضافة للآيفون',
    installTitleAndroid: 'التثبيت على أندرويد',
    installTitleIOS: 'التثبيت على آيفون / آيباد',
    offlineBanner: 'وضع بدون إنترنت · الحفظ المحلي نشط',
    gotIt: 'فهمت',
    dpadLabel: 'أسهم',
    stickLabel: 'عصا',
    actLabel: 'تفاعل',
    useLabel: 'استخدام',
    livestockHeader: 'حيوانات المزرعة والري الذكي',
    chickenName: 'دجاجة المزرعة',
    chickenDesc: 'تتجول في الفناء وتضع بيضة طازجة كل صباح (تُباع بـ 38g أو تمنح +30 طاقة).',
    adoptChicken: 'تبنّي',
    coopFull: 'مكتمل',
    fullscreenBtn: 'ملء الشاشة',
    exitFullscreenBtn: 'إنهاء ملء الشاشة',
    rotateLandscapeHint: 'يفضّل تشغيل اللعبة بالعرض (Landscape) على الهاتف',
    enableLandscapeBtn: 'وضع أفقي',
    blindModeBtn: 'وضع المكفوفين',
    blindModeOn: 'وضع المكفوفين: مفعّل',
    blindModeOff: 'وضع المكفوفين: معطّل',
    blindScanBtn: 'فحص',
    blindGuideBtn: 'توجيه',
    blindStatusBtn: 'الحالة',
    nasaBtn: 'ناسا',
    nasaModalTitle: 'مرصد ناسا',
    nasaModalSub: 'أقمار وبعثات ترصد حقلك وتساعد على الزراعة المستدامة',
    nasaDisclaimer:
      'معلومة تعريفية فقط: هذه البطاقات تعليمية، والطقس داخل اللعبة يُحاكي عشوائياً ولا يقرأ بيانات ناسا الحقيقية.',
    nasaStationTelemetryTitle: 'تقرير محطة الرصد في مزرعتك',
    nasaNoStationHint:
      'تلميح: اشترِ محطة رصد ناسا (150g) من المتجر وضعها في الحقل لعرض رطوبة التربة والحرارة وتوقع مطر الغد كل صباح!',
    soilMoistureLabel: 'رطوبة التربة',
    tempLabel: 'الحرارة',
    tomorrowLabel: 'توقع الغد',
    futureMsgTitle: 'رسالة من 2040',
    futureMsgSub: 'بلاغ من مزارع المستقبل · اليوم {day}',
    futureMsgDismiss: 'حفظت الرسالة',
    waterSavedLabel: 'لترات المياه الموفّرة',
    litersUnit: 'لتر',
    coreMissionsHeader: 'تحديات المزرعة الأساسية (1–12)',
    nasaMissionsHeader: 'مهام ناسا (13–16 · اختيارية)',
    badgesHeader: 'الشارات المكتسبة',
    unlockedBadge: 'مكتسبة',
    lockedBadge: 'مقفلة',
    badgeUnlockedToast: 'تم فتح شارة جديدة!',
    heatwaveHit: 'ذروة موجة الحر! احمِ الفراولة والطماطم بشبكة ظل!',
    rainCollectedToast: 'خزان المطر التقط +50 لتر من ماء العاصفة!',
    controlsDesktopNasa: 'N مرصد ناسا',
    dailyOrderTitle: 'طلب القرية اليومي',
    dailyOrderSub: 'سلّم المحصول المطلوب لتربح ذهباً إضافياً وطاقة',
    deliverOrderBtn: 'تسليم الطلب',
    orderDoneLabel: 'تم التسليم!',
    orderReadyHud: 'طلب القرية جاهز!',
    sprintBtn: 'ركض سريع (Shift)',
    comboToast: 'سلسلة حصاد x{n} (+{g}g)',
    treasureGoldToast: 'كنز مدفون بالتربة! +{g}g',
    treasureSeedToast: 'اكتشاف محظوظ! +1 {seed}',
    goldenHarvestToast: 'مضاعفة تلقيح النحل!',
    almanacBtn: 'الموسوعة',
    almanacTitle: 'موسوعة المزرعة والمستوى',
    almanacSub: 'المحاصيل المكتشفة، المنتجات الحرفية، أسماك البركة، وطلب السوق اليوم',
    farmerLevelLabel: 'مستوى {n}',
    xpLabel: 'الخبرة',
    marketSurgeLabel: 'طفرة السوق اليوم (+50%)',
    marketSurgeBadge: '+50% طفرة السوق',
    discoveredLabel: 'مكتشف',
    cowName: 'بقرة حلوب',
    cowDesc: 'ترعى في الفناء وتنتج حليباً طازجاً كل صباح (75g أو يُعصر لجبن فاخر).',
    sheepName: 'خروف المزرعة',
    sheepDesc: 'يتجول في المرعى وينتج صوفاً ناعماً كل صباح (يُباع بـ 68g).',
    dogName: 'كلب الحراسة الوفي',
    dogDesc: 'يحرس المزرعة وينبح تلقائياً لطرد الأرانب والخنازير البرية ليلاً!',
    extendedMissionsHeader: 'تحديات الحرف والصيد والرعي (17–20)',
    levelUpToast: 'ترقية! مستوى {n} (+5 طاقة قصوى)',
    dogBarkToast: 'هوهو! كلب الحراسة أبعد متسللاً!',
    almanacCropsTab: 'المحاصيل والزهور',
    almanacArtisanTab: 'الحرف والبركة',
    singleplayerBtn: 'لعب فردي (Singleplayer)',
    continueSingleplayer: 'متابعة اللعب الفردي',
    multiplayerRoomsBtn: 'غرف اللعب الجماعي (Rooms)',
    roomsModalTitle: 'غرف اللعب الجماعي التعاوني',
    roomsModalSub: 'أنشئ غرفة مزرعة مشتركة أو انضم لأصدقائك بكود الغرفة (حتى 4 لاعبين)',
    playerNameLabel: 'اسم المزارع',
    playerNamePlaceholder: 'اكتب اسمك...',
    createRoomTab: 'إنشاء غرفة',
    joinRoomTab: 'دخول / تصفح الغرف',
    roomNameLabel: 'اسم الغرفة',
    roomNamePlaceholder: 'مثال: مزرعة الأصدقاء',
    publicRoomLabel: 'غرفة عامة (تظهر في قائمة الغرف)',
    privateRoomLabel: 'غرفة خاصة (بالكود فقط)',
    createAndPlayBtn: 'إنشاء ودخول الغرفة',
    joinByCodeLabel: 'الدخول بكود الغرفة',
    roomCodePlaceholder: 'كود من 6 أحرف (مثل ECO482)',
    joinRoomBtn: 'انضمام',
    publicRoomsHeader: 'الغرف العامة المتاحة',
    refreshRoomsBtn: 'تحديث',
    noPublicRooms: 'لا توجد غرف عامة حالياً — أنشئ غرفة جديدة للبدء مع أصدقائك!',
    playersCountLabel: '{n}/4 مزارعين',
    hostLabel: 'المضيف',
    roomBadgeLabel: 'غرفة',
    copyCodeBtn: 'نسخ الكود',
    codeCopiedToast: 'تم نسخ كود الغرفة!',
    copyLinkBtn: 'نسخ الرابط',
    linkCopiedToast: 'تم نسخ رابط الدعوة!',
    leaveRoomBtn: 'مغادرة الغرفة',
    chatBtn: 'دردشة (T)',
    chatPlaceholder: 'اكتب رسالة لفريق المزرعة...',
    noChatYet: 'لا توجد رسائل بعد — ألقِ التحية على فريقك!',
    sendChatBtn: 'إرسال',
    sleepVoteReady: 'تصويت النوم ({ready}/{total})',
    sleepVoteWaiting: 'بانتظار موافقة {left} مزارع للراحة وبداية اليوم التالي...',
    sleepReadyBtn: 'موافق على النوم',
    sleepCancelBtn: 'إلغاء',
    playerJoinedToast: 'انضم {name} إلى المزرعة!',
    playerLeftToast: 'غادر {name} المزرعة',
    reconnectingToast: 'جارٍ إعادة الاتصال بالغرفة...',
    roomErrorNotFound: 'كود الغرفة غير موجود. تأكد من الكود وحاول مرة أخرى.',
    roomErrorFull: 'الغرفة ممتلئة بالفعل (الحد الأقصى 4 مزارعين).',
    roomErrorConnect: 'تعذر الاتصال بسيرفر اللعب الجماعي.',
    roomErrorClosed: 'تم إغلاق الغرفة أو إعادة تشغيل السيرفر.',
    roomErrorTimeout: 'انتهت مهلة الاتصال بالسيرفر. حاول مرة أخرى.',
    customServerLabel: 'رابط سيرفر اللعب الجماعي (اختياري)',
    customServerHint: 'اتركه فارغاً لاستخدام سيرفر الموقع الحالي. مفيد لنسخة APK أو EXE أو Vercel.',
    serverDefaultBtn: 'الافتراضي',
    voiceJoinBtn: 'صوت (V)',
    voiceLeaveBtn: 'إنهاء الصوت',
    voiceMicOnBtn: 'كتم المايك (V)',
    voiceMicOffBtn: 'فتح المايك (V)',
    voiceDeafenBtn: 'كتم صوت الفريق',
    voiceUndeafenBtn: 'تشغيل صوت الفريق',
    voiceActiveLabel: 'الصوت متصل',
    voiceSpeakingLabel: 'يتحدث',
    voiceMutedLabel: 'مكتوم',
    voiceErrorPermission: 'تم رفض إذن الميكروفون. اسمح بالوصول للمايك للتحدث.',
    voiceErrorUnsupported: 'الدردشة الصوتية تتطلب HTTPS ومتصفحاً يدعم المكالمات.',
    voiceListenOnlyToast: 'لم يُعثر على ميكروفون — تم الدخول بوضع الاستماع فقط.',
    voiceMutePeerBtn: 'كتم اللاعب',
    voiceUnmutePeerBtn: 'إلغاء كتم اللاعب',
    forceUpdateTitle: 'يتوفر تحديث إجباري للعبة',
    forceUpdateSubtitle: 'يرجى تحديث EcoGrow Mission لمتابعة اللعب والدخول إلى الغرف الجماعية.',
    forceUpdateCurrentVer: 'نسختك الحالية',
    forceUpdateRequiredVer: 'الحد الأدنى المطلوب',
    forceUpdateLatestVer: 'أحدث نسخة',
    forceUpdateBtn: 'تحديث الآن',
    forceUpdateRecheckBtn: 'إعادة التحقق',
    forceUpdateChecking: 'جارٍ التحقق...',
    forceUpdateOfflineRetry: 'تعذر الوصول إلى خادم التحديثات. تحقق من الإنترنت وحاول بعد قليل.',
    forceUpdateSaveSafe: 'بيانات حفظ مزرعتك الفردية المحلية محفوظة بأمان ولن تتأثر بالتحديث.',
    forceUpdateDownloading: 'جارٍ تنزيل الملفات المتغيرة فقط...',
    forceUpdateProgressFiles: 'تم تحديث {done} من {total} ملف متغير ({skipped} لم تتغير)',
    forceUpdateServerOnlyMsg: 'تم تحديث إعدادات واتصال السيرفر بنجاح في نفس الصفحة!',
    forceUpdateModeServerOnly: 'تحديث للسيرفر فقط (بدون تحميل ملفات اللعبة)',
    forceUpdateModeDelta: 'تحديث ذكي (ينزّل الملفات التي تغيرت فقط)',
    forceUpdateReadyReload: 'تم تطبيق التحديث! جارٍ إعادة التشغيل في نفس النافذة...',
    tierTitanium: 'المستوى التيتانيوم',
    catName: 'قط المزرعة اللطيف',
    catDesc: 'يتجول في المزرعة، يمنح +10 صحة و+8 طاقة عند ملاطفته، ويحضر هدية كل صباح!',
    quickEatBtn: 'أكل سريع (Q)',
    miniMapBtn: 'الخريطة (Z)',
    miniMapTitle: 'خريطة المزرعة المصغرة',
    swiftBuffBadge: 'تأثير الشاي',
    streakBadge: 'يوم {n} (+{g}g)',
    almanacStatsTab: 'إحصائيات المزرعة',
    portalsBtn: 'العوالم',
    portalModalTitle: 'بوابة العوالم والمناطق الجديدة',
    portalModalSub: 'افتح بوابات قديمة وسافر لاكتشاف الغابة الهامسة وواحة الكريستال وملاذ السماء',
    travelBtn: 'سفر',
    unlockRealmBtn: 'فتح العالم',
    currentRealmBadge: 'أنت هنا',
    unlockedLabel: 'مفتوح',
    lockedLabel: 'مغلق',
    realmArrivalToast: 'وصلت إلى {realm}!',
  },
};

export const UI_TEXT: Record<Language, UiTextMap> = {
  en: BASE_UI_TEXT.en,
  ar: BASE_UI_TEXT.ar,
  fr: EXTRA_LOCALES.fr.ui,
  es: EXTRA_LOCALES.es.ui,
  de: EXTRA_LOCALES.de.ui,
  it: EXTRA_LOCALES.it.ui,
  pt: EXTRA_LOCALES.pt.ui,
  tr: EXTRA_LOCALES.tr.ui,
  ru: EXTRA_LOCALES.ru.ui,
  ja: EXTRA_LOCALES.ja.ui,
  ko: EXTRA_LOCALES.ko.ui,
  zh: EXTRA_LOCALES.zh.ui,
};
