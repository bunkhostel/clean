import { Language } from '../types';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Play pleasant synthetic chime for completing a task
export function playSuccessChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, now);
    osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.12);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // Ignore audio autoplay restrictions
  }
}

// Play alert tone when validation finds missing tasks
export function playAlertTone() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(330, now + 0.15);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    // Ignore
  }
}

// Play mic start listening tone (rising chirp)
export function playMicStartBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.18);
  } catch {
    // Ignore
  }
}

// Play mic stop listening tone (descending chirp)
export function playMicStopBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(780, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.14);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    // Ignore
  }
}

// Voice synthesis status tracking
let currentSpeakingId: string | null = null;
let speakingListeners: ((speakingId: string | null) => void)[] = [];

export function subscribeSpeakingStatus(listener: (speakingId: string | null) => void) {
  speakingListeners.push(listener);
  return () => {
    speakingListeners = speakingListeners.filter(l => l !== listener);
  };
}

function notifySpeaking(id: string | null) {
  currentSpeakingId = id;
  speakingListeners.forEach(l => l(id));
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    notifySpeaking(null);
  }
}

let availableVoices: SpeechSynthesisVoice[] = [];

// Voices load asynchronously on Chrome/Android, so refresh them whenever the browser announces a change.
function refreshVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    availableVoices = voices;
  }
  return availableVoices;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// Windows/Edge Hindi voices: Kalpana & Hemant; Indian English voices: Ravi & Heera, Neerja.
const HINDI_VOICE_NAME = /hindi|हिन्दी|हिंदी|kalpana|hemant|lekha|neerja/i;
const INDIAN_ENGLISH_VOICE_NAME = /ravi|heera|neerja/i;

function normalizeLang(lang: string): string {
  return lang.toLowerCase().replace('_', '-');
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = refreshVoices();
  if (voices.length === 0) return undefined;

  const normalizedLang = normalizeLang(lang);
  const primary = normalizedLang.split('-')[0];

  const exact = voices.find((v) => normalizeLang(v.lang) === normalizedLang);
  if (exact) return exact;

  if (primary === 'hi') {
    // Only a genuinely Hindi-capable voice counts here; an English voice would read
    // Devanagari as silence.
    return voices.find(
      (v) => normalizeLang(v.lang).startsWith('hi') || HINDI_VOICE_NAME.test(v.name)
    );
  }

  if (primary === 'en') {
    // Prefer Indian English even when the OS default is en-US, because it pronounces
    // Hindi transliterations correctly.
    const indianEnglish =
      voices.find((v) => normalizeLang(v.lang) === 'en-in') ||
      voices.find(
        (v) => normalizeLang(v.lang).startsWith('en') && INDIAN_ENGLISH_VOICE_NAME.test(v.name)
      );
    if (indianEnglish) return indianEnglish;
  }

  return voices.find((v) => normalizeLang(v.lang).startsWith(primary));
}

/** Best installed English voice, preferring Indian English for Hindi transliterations. */
function pickEnglishFallbackVoice(): SpeechSynthesisVoice | undefined {
  return (
    pickVoice('en-IN') ||
    pickVoice('en-US') ||
    pickVoice('en-GB') ||
    refreshVoices()[0]
  );
}

// Staff listen while working, so narration runs slightly slower than the selected preset.
const SPEECH_RATE_FACTOR = 0.82;

function resolveRate(rate?: number): number {
  const base = typeof rate === 'number' && Number.isFinite(rate) ? rate : 0.85;
  return Math.min(2, Math.max(0.5, base * SPEECH_RATE_FACTOR));
}

const HAS_DEVANAGARI = /[\u0900-\u097F]/;

const DEVANAGARI_CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'ng',
  च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm',
  य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh', ष: 'sh', स: 's', ह: 'h', ळ: 'l',
  क़: 'q', ख़: 'kh', ग़: 'g', ज़: 'z', ड़: 'r', ढ़: 'rh', फ़: 'f', य़: 'y',
};

const DEVANAGARI_VOWELS: Record<string, string> = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ऋ: 'ri', ॠ: 'ree',
  ऌ: 'li', ॡ: 'lee', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऍ: 'e', ऑ: 'o', ऎ: 'e', ऒ: 'o',
};

const DEVANAGARI_MATRAS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'ॄ': 'ree',
  'ॢ': 'li', 'ॣ': 'lee', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e', 'ॆ': 'e', 'ॊ': 'o',
};

const NUKTA_VARIANTS: Record<string, string> = {
  क: 'q', ख: 'kh', ग: 'g', ज: 'z', ड: 'r', ढ: 'rh', फ: 'f', य: 'y', न: 'n', र: 'r', त: 't', द: 'd', स: 's',
};

const NUKTA = '\u093C';
const VIRAMA = '्';
const WORD_BOUNDARY = /[\s.,!?;:।॥()[\]{}"'“”‘’\-–—/\\]/;

/**
 * Devanagari -> Latin transliteration for devices with no Hindi voice installed.
 * An installed Indian-English voice then reads the Hindi text recognisably instead of
 * silently choking on the Devanagari script.
 */
export function transliterateHindi(input: string): string {
  const chars = Array.from(input);
  let out = '';

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (DEVANAGARI_CONSONANTS[ch]) {
      let consonant = DEVANAGARI_CONSONANTS[ch];
      let cursor = i + 1;

      // A combining nukta modifies the preceding consonant: फ + ़ = f, ड + ़ = r
      if (chars[cursor] === NUKTA) {
        consonant = NUKTA_VARIANTS[ch] || consonant;
        cursor++;
      }

      out += consonant;
      const following = chars[cursor];

      if (following === VIRAMA) {
        i = cursor; // consonant cluster: suppress the inherent vowel
      } else if (following && DEVANAGARI_MATRAS[following]) {
        out += DEVANAGARI_MATRAS[following];
        i = cursor;
      } else {
        // Inherent vowel, except at a word boundary where the schwa is dropped: तपोवन -> tapovan
        if (following && !WORD_BOUNDARY.test(following)) {
          out += 'a';
        }
        i = cursor - 1;
      }

      continue;
    }

    if (DEVANAGARI_VOWELS[ch]) {
      out += DEVANAGARI_VOWELS[ch];
      continue;
    }

    const digitIndex = '०१२३४५६७८९'.indexOf(ch);
    if (digitIndex >= 0) {
      out += String(digitIndex);
      continue;
    }

    if (ch === 'ं' || ch === 'ँ') out += 'n';
    else if (ch === 'ः') out += 'h';
    else if (ch === '।' || ch === '॥') out += '.';
    else if (ch === VIRAMA || ch === NUKTA) out += '';
    else out += ch;
  }

  return out.replace(/\s+/g, ' ').trim();
}

/** Optional English rendition used when the device has no Hindi voice. */
export interface SpeakFallback {
  text: string;
  lang?: Language;
}

/**
 * Speaks exact text string using the browser Web Speech API.
 * No network call or API key is involved: audio is synthesized locally by the browser.
 * Returns true when an utterance was dispatched.
 *
 * When the device has no voice for `lang` (e.g. Hindi on an English-only Windows install),
 * the browser would "speak" Devanagari as silence. Instead we:
 *   1. speak `fallback.text` when the caller supplied one, otherwise
 *   2. transliterate Devanagari and speak it with the installed Indian-English voice.
 */
export function speakText(
  text: string,
  lang: Language = 'hi-IN',
  elementId?: string,
  rate: number = 0.85,
  fallback?: SpeakFallback
): boolean {
  if (!isSpeechSynthesisSupported()) {
    console.warn('[TTS] window.speechSynthesis is unavailable in this browser.');
    notifySpeaking(null);
    return false;
  }

  const cleanText = text ? text.trim() : '';
  if (!cleanText) {
    notifySpeaking(null);
    return false;
  }

  const requestedLang = lang || 'hi-IN';
  const requestedVoice = pickVoice(requestedLang);
  const hindiVoice = pickVoice('hi-IN');

  let finalText = cleanText;
  let finalLang: string = requestedLang;
  let finalVoice = requestedVoice;

  if (!requestedVoice) {
    const fallbackText = fallback?.text?.trim() || '';
    const fallbackLang = fallback?.lang || 'en-IN';
    if (fallbackText && pickVoice(fallbackLang)) {
      finalText = fallbackText;
      finalLang = fallbackLang;
      finalVoice = pickVoice(fallbackLang);
      console.warn(
        `[TTS] No "${requestedLang}" voice installed; speaking the English rendition instead.`
      );
    } else {
      finalVoice = pickEnglishFallbackVoice();
      finalLang = finalVoice?.lang || 'en-IN';
    }
  }

  // Devanagari cannot be voiced by an English voice, even mid-sentence.
  if (HAS_DEVANAGARI.test(finalText)) {
    if (hindiVoice) {
      finalVoice = hindiVoice;
      finalLang = hindiVoice.lang;
    } else {
      finalText = transliterateHindi(finalText);
      if (!finalVoice) {
        finalVoice = pickEnglishFallbackVoice();
        finalLang = finalVoice?.lang || 'en-IN';
      }
      console.warn(
        `[TTS] No Hindi voice installed; speaking a transliteration of the Devanagari text. ` +
          'Install a Hindi text-to-speech voice for native pronunciation.'
      );
    }
  }

  if (!finalText) {
    notifySpeaking(null);
    return false;
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(finalText);
  utterance.lang = finalLang;
  utterance.rate = resolveRate(rate);
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  if (finalVoice) {
    utterance.voice = finalVoice;
  }

  let started = false;

  utterance.onstart = () => {
    started = true;
    notifySpeaking(elementId || 'global');
  };
  utterance.onend = () => notifySpeaking(null);
  utterance.onerror = (event) => {
    notifySpeaking(null);
    if (event.error !== 'interrupted' && event.error !== 'canceled') {
      console.warn(`[TTS] Speech synthesis failed (${event.error}) for lang="${utterance.lang}".`);
    }
  };

  const dispatch = () => {
    if (synth.paused) synth.resume();
    synth.speak(utterance);
  };

  // Speak synchronously: the click's user activation is transient, and Chrome rejects
  // speak() calls made from a later task on some builds.
  dispatch();

  // Chrome/Android occasionally swallow an utterance dispatched right after cancel().
  // If it never started, retry once.
  window.setTimeout(() => {
    if (!started && !synth.speaking && !synth.pending) {
      const readyVoice = pickVoice(utterance.lang);
      if (readyVoice) {
        utterance.voice = readyVoice;
      }
      dispatch();
    }
  }, 300);

  return true;
}

/**
 * Strict card narration: speaks ONLY the title followed by the caption.
 * Badges, highlights, counts, staff lists and other card metadata are never read.
 */
export function speakCard(
  title: string | undefined,
  caption: string | undefined,
  lang: Language = 'hi-IN',
  elementId?: string,
  rate: number = 0.85,
  fallback?: { title?: string; caption?: string; lang?: Language }
): boolean {
  const cleanTitle = title?.trim() || '';
  const cleanCaption = caption?.trim() || '';
  // Skip a caption that merely repeats the title so it isn't spoken twice.
  const textToSpeak = [cleanTitle, cleanCaption === cleanTitle ? '' : cleanCaption]
    .filter(Boolean)
    .join('. ');

  const fallbackText = [fallback?.title?.trim() || '', fallback?.caption?.trim() || '']
    .filter(Boolean)
    .join('. ');

  return speakText(
    textToSpeak,
    lang,
    elementId,
    rate,
    fallbackText ? { text: fallbackText, lang: fallback?.lang || 'en-IN' } : undefined
  );
}

// ==========================================
// HINDI SPEECH RECOGNITION (SPEECH-TO-TEXT)
// ==========================================

export interface SpeechRecognitionResultPayload {
  transcript: string;
  isFinal: boolean;
}

export interface SpeechRecognitionOptions {
  lang?: Language;
  continuous?: boolean;
  interimResults?: boolean;
  onStart?: () => void;
  onResult: (payload: SpeechRecognitionResultPayload) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

// Check if Web Speech API Speech Recognition is supported
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

/**
 * Start listening for Hindi / English speech and transcribe in real-time.
 * Returns an object with `stop` and `abort` methods.
 */
export function startHindiTranscription(options: SpeechRecognitionOptions): {
  stop: () => void;
  abort: () => void;
} {
  if (typeof window === 'undefined') {
    options.onError?.('Window is not defined.');
    return { stop: () => {}, abort: () => {} };
  }

  // Stop any ongoing TTS speech so microphone doesn't pick up computer audio
  stopSpeaking();

  const SpeechRecognitionClass =
    (window as unknown as { SpeechRecognition: any }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition: any }).webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    options.onError?.('Speech recognition is not supported in this browser. Please use Google Chrome or Edge.');
    return { stop: () => {}, abort: () => {} };
  }

  let recognition: any = null;

  try {
    recognition = new SpeechRecognitionClass();
    recognition.lang = options.lang || 'hi-IN';
    recognition.continuous = options.continuous ?? false;
    recognition.interimResults = options.interimResults ?? true;
    recognition.maxAlternatives = 1;

    playMicStartBeep();

    recognition.onstart = () => {
      options.onStart?.();
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        const text = result[0]?.transcript || '';
        if (result.isFinal) {
          finalTranscript += text;
        } else {
          interimTranscript += text;
        }
      }

      if (finalTranscript.trim()) {
        options.onResult({
          transcript: finalTranscript.trim(),
          isFinal: true,
        });
      } else if (interimTranscript.trim()) {
        options.onResult({
          transcript: interimTranscript.trim(),
          isFinal: false,
        });
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition event error:', event.error);
      playMicStopBeep();
      let errorMsg = 'माइक्रोफ़ोन त्रुटि हुई (Microphone error)';
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        errorMsg = 'माइक्रोफ़ोन की अनुमति नहीं मिली (Microphone permission denied)';
      } else if (event.error === 'no-speech') {
        errorMsg = 'कोई आवाज़ सुनाई नहीं दी, कृपया दोबारा बोलें (No speech detected)';
      } else if (event.error === 'network') {
        errorMsg = 'नेटवर्क त्रुटि (Network error with speech service)';
      }
      options.onError?.(errorMsg);
    };

    recognition.onend = () => {
      playMicStopBeep();
      options.onEnd?.();
    };

    recognition.start();

    return {
      stop: () => {
        try {
          recognition?.stop();
        } catch {
          // Ignore
        }
      },
      abort: () => {
        try {
          recognition?.abort();
        } catch {
          // Ignore
        }
      },
    };
  } catch (err: any) {
    options.onError?.(err?.message || 'Could not start speech recognition');
    return { stop: () => {}, abort: () => {} };
  }
}


