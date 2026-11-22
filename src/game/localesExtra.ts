import { DE_LOCALE, IT_LOCALE } from './locales/lang_de_it';
import { ES_LOCALE, FR_LOCALE } from './locales/lang_fr_es';
import { KO_LOCALE, ZH_LOCALE } from './locales/lang_ko_zh';
import { PT_LOCALE, TR_LOCALE } from './locales/lang_pt_tr';
import { JA_LOCALE, RU_LOCALE } from './locales/lang_ru_ja';
import type { ExtraLanguage, LanguageOption, LocalePack } from './locales/types';

export type { ExtraLanguage, LanguageOption, LocalePack, UiTextMap } from './locales/types';

export const EXTRA_LOCALES: Record<ExtraLanguage, LocalePack> = {
  fr: FR_LOCALE,
  es: ES_LOCALE,
  de: DE_LOCALE,
  it: IT_LOCALE,
  pt: PT_LOCALE,
  tr: TR_LOCALE,
  ru: RU_LOCALE,
  ja: JA_LOCALE,
  ko: KO_LOCALE,
  zh: ZH_LOCALE,
};

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl', speechLang: 'ar-EG' },
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', speechLang: 'en-US' },
  { code: 'fr', nativeName: 'Français', englishName: 'French', dir: 'ltr', speechLang: 'fr-FR' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', dir: 'ltr', speechLang: 'es-ES' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', dir: 'ltr', speechLang: 'de-DE' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian', dir: 'ltr', speechLang: 'it-IT' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese', dir: 'ltr', speechLang: 'pt-BR' },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish', dir: 'ltr', speechLang: 'tr-TR' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian', dir: 'ltr', speechLang: 'ru-RU' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese', dir: 'ltr', speechLang: 'ja-JP' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean', dir: 'ltr', speechLang: 'ko-KR' },
  { code: 'zh', nativeName: '简体中文', englishName: 'Chinese', dir: 'ltr', speechLang: 'zh-CN' },
];
