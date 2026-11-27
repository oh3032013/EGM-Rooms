import type { RealmCreatureKind, RealmId } from './types.ts';

export type StoryLang = 'ar' | 'en';

export function resolveStoryLang(lang: string): StoryLang {
  return lang === 'ar' ? 'ar' : 'en';
}

export interface MissionStepStory {
  number: string;
  title: Record<StoryLang, string>;
  detail: Record<StoryLang, string>;
}

export interface OriginStoryDef {
  title: Record<StoryLang, string>;
  subtitle: Record<StoryLang, string>;
  howItStartedHeading: Record<StoryLang, string>;
  howItStartedParagraphs: Record<StoryLang, string[]>;
  yourMissionHeading: Record<StoryLang, string>;
  yourMissionSteps: MissionStepStory[];
  closingHook: Record<StoryLang, string>;
}

export const ORIGIN_STORY: OriginStoryDef = {
  title: {
    ar: 'بداية الحكاية: مزرعة الجد ووادي الأمل',
    en: "The Beginning: Grandfather's Valley",
  },
  subtitle: {
    ar: 'كيف بدأت المزرعة… وما هي مهمتك لإنقاذ العوالم الأربعة',
    en: 'How the homestead began… and your mission to reunite the four realms',
  },
  howItStartedHeading: {
    ar: 'كيف بدأت المزرعة؟',
    en: 'How the Farm Started',
  },
  howItStartedParagraphs: {
    ar: [
      'قبل سنوات طويلة، كانت مزرعة «وادي الأمل» قلب العوالم الأربعة؛ كان جدّك يتبادل البذور والمياه النقية مع حراس الغابة الهامسة وواحة الكريستال وملاذ السماء عبر البوابة الحجرية القديمة.',
      'لكن عندما ضربت عواصف الجفاف الكبير الأرض، خفتَ نور البوابة وانقطعت الطرق بين العوالم، وغطّت الأعشاب والصخور الحقول المهجورة بينما صمتت مسلّة الساعة الشمسية خلف المزرعة.',
      'اليوم ورثتَ هذه الأرض ومعك أدوات جدّك القديمة، وست بذور قمح، وبئر ماءٍ ما زال ينبض تحت التراب… بالإضافة إلى إشارة زمنية غامضة قادمة من عام ٢٠٤٠ تنتظر من يعيد الحياة إلى التربة.',
    ],
    en: [
      'Years ago, Willowvale Homestead stood at the crossroads of four living Eco-Realms. Your grandfather shared seeds, clear well-water, and harvest wisdom with elders from Whispering Woods, Crystal Oasis, and Sky Sanctuary through the Ancient Portal.',
      'Then came the Great Drought. Ash winds silenced the Sun-Dial Cairn, sealed the portals shut, and scattered hungry wildlife into the night—leaving the homestead buried beneath weeds, stumps, and stones.',
      'Today you arrive with weathered tools, six wheat seeds, a deep stone well, and a faint 2040 time echo humming beneath the valley—ready to bring green life back to the soil.',
    ],
  },
  yourMissionHeading: {
    ar: 'ما هي مهمتك في اللعبة؟',
    en: 'What Is Your Mission?',
  },
  yourMissionSteps: [
    {
      number: '١',
      title: {
        ar: 'أحيِ المزرعة واحمِ المحاصيل',
        en: 'Revive the Soil & Guard the Fields',
      },
      detail: {
        ar: 'نظّف الأرض من الأعشاب والحجارة، احرث التربة وازرع البذور واسقها من البئر، وتصدّ للحيوانات المتسللة ليلاً.',
        en: 'Clear overgrowth, till soil, sow and water crops from the well, raise farm animals, and defend your fields at night.',
      },
    },
    {
      number: '٢',
      title: {
        ar: 'أتمّ المهام لتفتح بوابات العوالم',
        en: 'Complete Missions to Awaken Portals',
      },
      detail: {
        ar: 'كل عالم مجاور مغلق بمهام محددة؛ أنجز مهام الزراعة والاستكشاف لتكسر الختم وتفتح البوابة التالية.',
        en: 'Every neighboring realm is sealed behind guardian missions—finish farming and exploration goals to unlock the next gate.',
      },
    },
    {
      number: '٣',
      title: {
        ar: 'زُر القرى واكتشف المناطق الغريبة حتى عام ٢٠٤٠',
        en: 'Visit Villages, Elders & Strange Zones',
      },
      detail: {
        ar: 'تحدّث مع حكماء القرى، تفحّص المناطق الغريبة، احمِ الحيوانات البرية النادرة، وأعِد وصل العوالم الأربعة بمستقبل ٢٠٤٠.',
        en: 'Speak with each Village Elder, study Strange Zone anomalies, meet native realm wildlife, and link all four realms with the future of 2040.',
      },
    },
  ],
  closingHook: {
    ar: 'ابدأ الآن بتنظيف قطعة أرض صغيرة، احرثها بالمعزقة، ازرع القمح واسقهِ… وستسمع بوابة العوالم تستيقظ!',
    en: 'Start by clearing a patch of turf, tilling with your hoe, sowing wheat, and watering—soon the Ancient Portal will stir!',
  },
};

export interface RealmStoryDef {
  realmId: RealmId;
  chapterNumber: number;
  chapterLabel: Record<StoryLang, string>;
  title: Record<StoryLang, string>;
  summary: Record<StoryLang, string>;
  chronicle: Record<StoryLang, string>;
  villageName: Record<StoryLang, string>;
  elderName: Record<StoryLang, string>;
  elderRole: Record<StoryLang, string>;
  elderGreeting: Record<StoryLang, string>;
  elderBlessingText: Record<StoryLang, string>;
  strangeZoneName: Record<StoryLang, string>;
  strangeZoneLore: Record<StoryLang, string>;
  strangeZoneEffect: Record<StoryLang, string>;
  nativeCreatures: RealmCreatureKind[];
}

export const CREATURE_LABELS: Record<RealmCreatureKind, Record<StoryLang, string>> = {
  fox: { ar: 'ثعلب الغابة الأحمر', en: 'Red Woodland Fox' },
  deer: { ar: 'غزال السنديان', en: 'Oakwood Deer' },
  fennec: { ar: 'فنك الصحراء', en: 'Desert Fennec' },
  gazelle: { ar: 'غزال الكريستال', en: 'Crystal Gazelle' },
  scarab: { ar: 'جعل الزمرد', en: 'Emerald Scarab' },
  crane: { ar: 'كركي السحاب', en: 'Cloud Crane' },
  alpaca: { ar: 'ألباكا الغيوم', en: 'Sky Alpaca' },
  star_owl: { ar: 'بومة النجوم', en: 'Astral Star-Owl' },
};

export const REALM_STORIES: Record<RealmId, RealmStoryDef> = {
  homestead: {
    realmId: 'homestead',
    chapterNumber: 1,
    chapterLabel: { ar: 'الفصل الأول', en: 'Chapter I' },
    title: { ar: 'رماد الجفاف وبذور الأمل', en: 'Ashes of Drought & First Seeds' },
    summary: {
      ar: 'مزرعتك المهجورة في وادي المزرعة تخفي خلف أشجارها مسلّة ساعة شمسية قديمة صمتت منذ الجفاف الكبير.',
      en: 'Your overgrown homestead hides an ancient Sun-Dial Cairn that fell silent when the Great Drought severed the four Eco-Realms.',
    },
    chronicle: {
      ar: 'عندما بدأتَ حرث التربة وسقي أولى البذور، عاد النبض إلى بوابة العوالم القديمة عند حافة الوادي. تقول الأساطير إن كل عالمٍ مجاور يحفظ سراً زراعياً وبقيةً من قرى الحراس القدامى. اجمع ثمار الوادي وأثبت جدارتك لتفتح أولى البوابات.',
      en: 'As your hoe turned the dry turf and your watering can brought life back to the soil, the Ancient Portal stirred by the western path. Legend says three neighboring realms still shelter guardian villages and strange ecological anomalies—waiting for a true steward.',
    },
    villageName: { ar: 'مفترق سوق القرية', en: 'Willowvale Market Outpost' },
    elderName: { ar: 'تاجر الوادي', en: 'Valley Merchant' },
    elderRole: { ar: 'حارس البذور المحلي', en: 'Local Seed Keeper' },
    elderGreeting: {
      ar: 'أهلاً بك في وادي المزرعة! جهّز الحقل وأتمّ مهام البداية لتستيقظ البوابة الغربية.',
      en: 'Welcome to Homestead Valley! Tend the soil and finish starter goals to awaken the western portal.',
    },
    elderBlessingText: {
      ar: 'يباركك الوادي بنسمة نشاط!',
      en: 'The valley breeze restores your focus!',
    },
    strangeZoneName: { ar: 'مسلّة الساعة الشمسية الصامتة', en: 'Silent Sun-Dial Cairn' },
    strangeZoneLore: {
      ar: 'حجر دائري مغطى بالطحالب محفور عليه رموز الفصول الأربعة وإحداثيات لعام 2040. عند لمسه تسمع همساً قادماً عبر الزمن يحثّك على الحفاظ على كل قطرة ماء.',
      en: 'A moss-ringed monolith etched with the four seasons and coordinates marked "2040". Touching its crystal dial echoes a faint transmission warning that every drop of water shapes tomorrow.',
    },
    strangeZoneEffect: {
      ar: 'صدى الزمن يمنحك +15 طاقة و+12 ذهب!',
      en: 'Time echo grants +15 Stamina and +12g!',
    },
    nativeCreatures: [],
  },
  whispering_woods: {
    realmId: 'whispering_woods',
    chapterNumber: 2,
    chapterLabel: { ar: 'الفصل الثاني', en: 'Chapter II' },
    title: { ar: 'قرية السنديان والمسلّة الهامسة', en: 'Sylvan Village & The Whispering Monolith' },
    summary: {
      ar: 'غابة زمردية تعيش فيها الثعالب والغزلان حول قرية خشبية تحرس جذور الغابة القديمة.',
      en: 'An emerald woodland where red foxes and oakwood deer roam beside a timber village guarding ancient forest roots.',
    },
    chronicle: {
      ar: 'خلف البوابة الأولى تمتد الغابة الهامسة برائحة الصنوبر والطحلب الرطب. في الشمال الشرقي تقع «قرية السنديان» حيث تحتفظ الحكيمة ليرا بسجلات التربة الخصبة، بينما ينبعث في الركن الشمالي الغربي ضوءٌ زمردي غريب من «المسلّة الهامسة» التي تضخ الحياة في جذوع الأشجار.',
      en: 'Beyond the first gate lies Whispering Woods, carpeted in emerald moss and rich timber. In the northeast nestles Sylvan Village, where Elder Lyra tends the forest seed archives, while a humming emerald anomaly—The Whispering Monolith—pulses in the northwest glade.',
    },
    villageName: { ar: 'قرية السنديان العتيق', en: 'Sylvan Oakwood Village' },
    elderName: { ar: 'الحكيمة ليرا', en: 'Elder Lyra' },
    elderRole: { ar: 'حارسة جذور الغابة', en: 'Keeper of Woodland Roots' },
    elderGreeting: {
      ar: 'مرحباً يا حارس الوادي! ثعالب الغابة وغزلانها لم ترَ مزارعاً مخلصاً منذ سنوات. تفحّص المسلّة الهامسة شمال غرب القرية إن كنت تبحث عن سر واحة الكريستال.',
      en: 'Greetings, valley steward! Our foxes and deer have long awaited a careful farmer. Inspect the Whispering Monolith northwest of here if you seek the path to Crystal Oasis.',
    },
    elderBlessingText: {
      ar: 'أهدتك الحكيمة ليرا بركة الغابة: +25g و+20 طاقة و+3 خشب!',
      en: 'Elder Lyra gifted Woodland Blessing: +25g, +20 Stamina, +3 Wood!',
    },
    strangeZoneName: { ar: 'المسلّة الهامسة (منطقة غريبة)', en: 'The Whispering Monolith (Strange Zone)' },
    strangeZoneLore: {
      ar: 'أحجار حية تدور حولها جزيئات زمردية، وكأن جذور الغابة تتبادل الرسائل عبرها! تسجيل نبضها يفتح الطريق أمامك نحو فهم طاقة واحة الكريستال.',
      en: 'Living stones orbited by emerald spores, humming as woodland roots exchange signals underground. Studying its resonance helps unlock the route to Crystal Oasis.',
    },
    strangeZoneEffect: {
      ar: 'رنين الغابة شحن طاقتك ومنحك +25 ذهب وبذور خزامى!',
      en: 'Forest resonance restored stamina and yielded +25g & Lavender Seed!',
    },
    nativeCreatures: ['fox', 'deer'],
  },
  crystal_oasis: {
    realmId: 'crystal_oasis',
    chapterNumber: 3,
    chapterLabel: { ar: 'الفصل الثالث', en: 'Chapter III' },
    title: { ar: 'قافلة السراب وصدع الكريستال', en: 'Mirage Caravan & The Pulsing Geode' },
    summary: {
      ar: 'واحة صحراوية مشمسة تسكنها ثعالب الفنك والغزلان وجُعَل الزمرد بجوار خيام القافلة وصدع بلوري نابض.',
      en: 'A sunlit desert sanctuary home to fennec foxes, crystal gazelles, and emerald scarabs beside caravan tents and a pulsing geode rift.',
    },
    chronicle: {
      ar: 'بين الكثبان الذهبية تتلألأ واحة الكريستال كبصيص أمل وسط الصحراء. في «قرية قافلة السراب» يتبادل الحكيم طارق أسرار حصاد المياه مع رحّالة الصحراء، بينما يغلي جنوب الواحة «صدع الكريستال النابض» الذي يرفع بلورات السماء نحو السحاب.',
      en: 'Among golden dunes shimmers Crystal Oasis. At Mirage Caravan Village, Water-Sage Tariq preserves ancient desert irrigation lore, while to the south a glowing crystal fissure—The Pulsing Geode Rift—channels upward currents toward the clouds.',
    },
    villageName: { ar: 'قرية قافلة السراب', en: 'Mirage Caravan Village' },
    elderName: { ar: 'الحكيم طارق', en: 'Water-Sage Tariq' },
    elderRole: { ar: 'شيخ قافلة الواحة', en: 'Oasis Caravan Sage' },
    elderGreeting: {
      ar: 'الصحراء تكافئ من يحترم الماء! ثعلب الفنك وغزالنا البرّي يشعران باقتراب عودة الحياة. تفحّص صدع الكريستال في الجنوب الشرقي لتقرأ رسالة الصعود إلى ملاذ السماء.',
      en: 'The desert rewards those who honor water! Our fennecs and gazelles sense the land healing. Study the Pulsing Geode Rift in the southeast to chart the ascent to Sky Sanctuary.',
    },
    elderBlessingText: {
      ar: 'قدّم لك الحكيم طارق ضيافة الواحة: +40g و+25 طاقة و+3 حجر!',
      en: 'Sage Tariq offered Caravan Hospitality: +40g, +25 Stamina, +3 Stone!',
    },
    strangeZoneName: { ar: 'صدع الكريستال النابض (منطقة غريبة)', en: 'Pulsing Geode Rift (Strange Zone)' },
    strangeZoneLore: {
      ar: 'تصدّع بلوري أزرق يطلق شرارات معدنية في الهواء ويُظهر انعكاساً لحديقة معلّقة فوق الغيوم! يبدو أن الكريستالات كانت قديماً محطة رفع للماء إلى السماء.',
      en: 'A luminous turquoise fissure throwing floating crystal motes skyward, reflecting an island suspended above the clouds—once an ancient atmospheric water conduit.',
    },
    strangeZoneEffect: {
      ar: 'توهج الكريستال منحك +40 ذهب و+2 حجر لامع وطاقة كاملة!',
      en: 'Crystal surge granted +40g, +2 Field Stone & Stamina boost!',
    },
    nativeCreatures: ['fennec', 'gazelle', 'scarab'],
  },
  sky_sanctuary: {
    realmId: 'sky_sanctuary',
    chapterNumber: 4,
    chapterLabel: { ar: 'الفصل الرابع (الختامي)', en: 'Chapter IV (Finale)' },
    title: { ar: 'قلعة الغيوم ومذبح صدع الزمن ٢٠٤٠', en: 'Cloudweaver Citadel & 2040 Astral Rift' },
    summary: {
      ar: 'جزيرة سماوية تحلق بها طيور الكركي والألباكا البيضاء وبومة النجوم حول مذبح زمني يربط الحاضر بعام 2040.',
      en: 'A celestial citadel where cloud cranes, sky alpacas, and star-owls gather beside a glowing altar linking your homestead to 2040.',
    },
    chronicle: {
      ar: 'أعلى من العواصف والحرّ تطفو جزيرة ملاذ السماء على أحجار السحاب المضيئة. في «قلعة نسّاجي السحاب» يكشف حارس النجوم أوريون الحقيقة الكاملة: كل بذرة زرعتها ومهمة أنجزتها أعادت وصل العوالم الأربعة بمستقبل عام 2040 عند «مذبح صدع الزمن».',
      en: 'High above storms and droughts floats Sky Sanctuary upon luminous cloud-stone. In Cloudweaver Citadel, Star-Keeper Orion reveals the truth: every field you healed rebuilt the bridge between all four realms and the thriving future of 2040 at the Astral Time-Rift Altar.',
    },
    villageName: { ar: 'قرية قلعة الغيوم', en: 'Cloudweaver Citadel' },
    elderName: { ar: 'حارس النجوم أوريون', en: 'Star-Keeper Orion' },
    elderRole: { ar: 'حكيم السحاب والنجوم', en: 'Astral Citadel Keeper' },
    elderGreeting: {
      ar: 'لقد وصلت أخيراً فوق الغيوم! طيور الكركي وبومة النجوم احتفت بقدومك. اقترب من مذبح صدع الزمن ٢٠٤٠ لتُتمّ عهد استعادة العوالم.',
      en: 'You have ascended above the storms! Our cloud cranes and star-owls celebrate your arrival. Approach the 2040 Astral Rift Altar to complete the EcoGrow Chronicle.',
    },
    elderBlessingText: {
      ar: 'منحك حارس النجوم نعمة السماء: +65g وطاقة وصحة ممتلئة!',
      en: 'Star-Keeper Orion bestowed Celestial Grace: +65g & full recovery!',
    },
    strangeZoneName: { ar: 'مذبح صدع الزمن ٢٠٤٠ (منطقة غريبة)', en: '2040 Astral Time-Rift Altar (Strange Zone)' },
    strangeZoneLore: {
      ar: 'منصة نجمية تتلألأ فوقها هالة بنفسجية تحمل رسالة كاملة من مزارعي 2040: «شكراً لأنك لم تترك الأرض تموت… العوالم الأربعة تزهر الآن في مستقبلنا.»',
      en: 'A radiant violet star-altar carrying a clear transmission from 2040: "Thank you for never giving up on the soil—all four realms bloom brightly in our future."',
    },
    strangeZoneEffect: {
      ar: 'إشراق النجوم منحك +75 ذهب و+2 سماد عضوي!',
      en: 'Astral radiance granted +75g & +2 Organic Fertilizer!',
    },
    nativeCreatures: ['crane', 'alpaca', 'star_owl'],
  },
};

export function buildOriginNarrationLines(lang: string): string[] {
  const sLang = resolveStoryLang(lang);
  return [
    ORIGIN_STORY.title[sLang],
    ...ORIGIN_STORY.howItStartedParagraphs[sLang],
    ORIGIN_STORY.yourMissionHeading[sLang],
    ...ORIGIN_STORY.yourMissionSteps.map(
      (step) => `${step.title[sLang]}. ${step.detail[sLang]}`
    ),
    ORIGIN_STORY.closingHook[sLang],
  ];
}

export function buildRealmNarrationLines(
  realmId: RealmId,
  lang: string,
  encounter?: 'elder' | 'strange_zone'
): string[] {
  const sLang = resolveStoryLang(lang);
  const story = REALM_STORIES[realmId];
  if (encounter === 'elder') {
    return [
      `${story.elderName[sLang]} — ${story.villageName[sLang]}.`,
      story.elderGreeting[sLang],
      story.elderBlessingText[sLang],
    ];
  }
  if (encounter === 'strange_zone') {
    return [
      story.strangeZoneName[sLang],
      story.strangeZoneLore[sLang],
      story.strangeZoneEffect[sLang],
    ];
  }
  const creatureNames = story.nativeCreatures.map((k) => CREATURE_LABELS[k][sLang]).join('، ');
  const creatureLine =
    story.nativeCreatures.length > 0
      ? sLang === 'ar'
        ? `تعيش في هذا العالم حيوانات مميزة منها: ${creatureNames}.`
        : `Native wildlife in this realm includes: ${creatureNames}.`
      : '';
  return [
    `${story.chapterLabel[sLang]}: ${story.title[sLang]}.`,
    story.summary[sLang],
    story.chronicle[sLang],
    `${story.villageName[sLang]}: ${story.elderGreeting[sLang]}`,
    `${story.strangeZoneName[sLang]}: ${story.strangeZoneLore[sLang]}`,
    ...(creatureLine ? [creatureLine] : []),
  ];
}
