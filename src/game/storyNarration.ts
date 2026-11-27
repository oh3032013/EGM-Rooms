import { audioEngine } from './audio.ts';
import { getLanguageOption, type Language } from './i18n.ts';

const AUTO_VOICE_STORAGE_KEY = 'ecogrow_story_auto_voice';

export interface StoryNarrationSnapshot {
  speaking: boolean;
  supported: boolean;
  lineIndex: number;
  totalLines: number;
  currentLine: string;
}

type Listener = (snapshot: StoryNarrationSnapshot) => void;

let currentSessionId = 0;
let activeLines: string[] = [];
let activeLang: Language = 'en';
let currentState: StoryNarrationSnapshot = {
  speaking: false,
  supported: isSpeechSupported(),
  lineIndex: -1,
  totalLines: 0,
  currentLine: '',
};

const listeners = new Set<Listener>();

function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

function emit(): void {
  const snapshot: StoryNarrationSnapshot = {
    ...currentState,
    supported: isSpeechSupported(),
  };
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function getStoryAutoVoicePreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = window.localStorage.getItem(AUTO_VOICE_STORAGE_KEY);
    if (val === '0' || val === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function saveStoryAutoVoicePreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTO_VOICE_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage errors
  }
}

export function getStoryNarrationSnapshot(): StoryNarrationSnapshot {
  return {
    ...currentState,
    supported: isSpeechSupported(),
  };
}

export function subscribeStoryNarration(listener: Listener): () => void {
  listeners.add(listener);
  listener(getStoryNarrationSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function splitNarrationLines(rawLines: string[]): string[] {
  const out: string[] = [];
  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const chunks = trimmed
      .split(/(?<=[.!?؟!…])\s+/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (chunks.length > 0) {
      out.push(...chunks);
    } else {
      out.push(trimmed);
    }
  }
  return out;
}

export function stopStoryNarration(): void {
  currentSessionId += 1;
  activeLines = [];
  audioEngine.setVoiceDucking(false);
  if (isSpeechSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore speech synthesis errors
    }
  }
  currentState = {
    speaking: false,
    supported: isSpeechSupported(),
    lineIndex: -1,
    totalLines: 0,
    currentLine: '',
  };
  emit();
}

function speakLineAt(sessionId: number, idx: number): void {
  if (sessionId !== currentSessionId) return;
  if (idx >= activeLines.length) {
    audioEngine.setVoiceDucking(false);
    currentState = {
      speaking: false,
      supported: isSpeechSupported(),
      lineIndex: -1,
      totalLines: activeLines.length,
      currentLine: '',
    };
    emit();
    return;
  }

  const line = activeLines[idx];
  currentState = {
    speaking: true,
    supported: isSpeechSupported(),
    lineIndex: idx,
    totalLines: activeLines.length,
    currentLine: line,
  };
  emit();

  if (!isSpeechSupported()) {
    // Timed subtitle fallback when SpeechSynthesis is unavailable
    const durationMs = Math.max(2200, Math.min(6000, line.length * 65));
    window.setTimeout(() => {
      if (sessionId === currentSessionId) {
        speakLineAt(sessionId, idx + 1);
      }
    }, durationMs);
    return;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(line);
    const speechTag = getLanguageOption(activeLang).speechLang;
    const prefix = speechTag.split('-')[0].toLowerCase();
    utterance.lang = speechTag;
    const voices = window.speechSynthesis.getVoices?.() ?? [];
    const matchedVoice =
      voices.find((v) => v.lang.toLowerCase() === speechTag.toLowerCase()) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }
    utterance.rate = activeLang === 'ar' ? 0.96 : 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => {
      if (sessionId === currentSessionId) {
        speakLineAt(sessionId, idx + 1);
      }
    };
    utterance.onerror = () => {
      if (sessionId === currentSessionId) {
        speakLineAt(sessionId, idx + 1);
      }
    };
    window.speechSynthesis.speak(utterance);
  } catch {
    audioEngine.setVoiceDucking(false);
    currentState = {
      speaking: false,
      supported: false,
      lineIndex: -1,
      totalLines: 0,
      currentLine: '',
    };
    emit();
  }
}

export function startStoryNarration(
  rawLines: string[],
  lang: Language,
  options?: { withChime?: boolean }
): void {
  if (typeof window === 'undefined') return;
  stopStoryNarration();
  const lines = splitNarrationLines(rawLines);
  if (lines.length === 0) return;

  const sessionId = ++currentSessionId;
  activeLines = lines;
  activeLang = lang;

  if (options?.withChime !== false) {
    audioEngine.playStoryChime();
  }
  audioEngine.setVoiceDucking(true);
  speakLineAt(sessionId, 0);
}
