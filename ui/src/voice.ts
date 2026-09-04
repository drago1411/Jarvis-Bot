/**
 * JARVIS Voice Module — Speech-to-Text Input & British Text-to-Speech Output
 * Uses the Web Speech API (zero dependencies, works in Chrome/Edge)
 */

// ─── Types ───────────────────────────────────────
type VoiceCallback = (transcript: string) => void;

interface JarvisVoice {
  startListening: (onResult: VoiceCallback) => void;
  stopListening: () => void;
  bargeIn: (onResult?: VoiceCallback) => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  isListening: () => boolean;
  isSpeaking: () => boolean;
}

// ─── Speech Recognition ──────────────────────────
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

let recognition: any = null;
let _isListening = false;

function initRecognition(): any {
  if (!SpeechRecognition) {
    console.warn('SpeechRecognition not supported in this browser.');
    return null;
  }

  const rec = new SpeechRecognition();
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  return rec;
}

// ─── Speech Synthesis ────────────────────────────
let _isSpeaking = false;

function getBritishVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  // Priority: British English male voice
  const priority = [
    (v: SpeechSynthesisVoice) => v.lang === 'en-GB' && v.name.toLowerCase().includes('male'),
    (v: SpeechSynthesisVoice) => v.lang === 'en-GB',
    (v: SpeechSynthesisVoice) => v.lang.startsWith('en-') && v.name.toLowerCase().includes('male'),
    (v: SpeechSynthesisVoice) => v.lang.startsWith('en-'),
  ];

  for (const test of priority) {
    const match = voices.find(test);
    if (match) return match;
  }
  return voices[0] || null;
}

// ─── Public API ──────────────────────────────────
export const voice: JarvisVoice = {
  bargeIn(onResult?: VoiceCallback) {
    if (_isSpeaking) {
      this.stopSpeaking();
    }
    if (onResult) {
      this.startListening(onResult);
    }
  },

  startListening(onResult: VoiceCallback) {
    // Instant Barge-In: Cut off any ongoing speech immediately
    if (_isSpeaking) {
      this.stopSpeaking();
    }

    if (_isListening) return;
    if (!recognition) recognition = initRecognition();
    if (!recognition) return;

    _isListening = true;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      _isListening = false;
    };

    recognition.onend = () => {
      _isListening = false;
    };

    recognition.start();
  },

  stopListening() {
    if (recognition && _isListening) {
      recognition.stop();
      _isListening = false;
    }
  },

  speak(text: string) {
    if (!('speechSynthesis' in window)) return;

    // Stop any ongoing speech
    speechSynthesis.cancel();

    // Clean markdown artifacts for cleaner speech
    const clean = text
      .replace(/```[\s\S]*?```/g, ' code block ')    // code blocks
      .replace(/`([^`]+)`/g, '$1')                     // inline code
      .replace(/\*\*([^*]+)\*\*/g, '$1')               // bold
      .replace(/\*([^*]+)\*/g, '$1')                   // italic
      .replace(/#+\s/g, '')                             // headings
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')         // links
      .replace(/[|─╔╗╚╝╠╣║═]/g, '')                   // table borders
      .replace(/\n{2,}/g, '. ')                        // paragraph breaks
      .replace(/\n/g, ' ')                             // line breaks
      .trim();

    if (!clean) return;

    // Split into chunks for long text (browsers limit utterance length)
    const chunks = clean.match(/.{1,200}[.!?,\s]|.{1,200}/g) || [clean];

    _isSpeaking = true;

    const speakChunk = (index: number) => {
      if (index >= chunks.length) {
        _isSpeaking = false;
        // Dispatch custom event so UI can react
        window.dispatchEvent(new Event('jarvis-speech-end'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      const britishVoice = getBritishVoice();
      if (britishVoice) utterance.voice = britishVoice;
      utterance.lang = 'en-GB';
      utterance.pitch = 0.95;
      utterance.rate = 0.92;
      utterance.volume = 1.0;

      utterance.onend = () => speakChunk(index + 1);
      utterance.onerror = () => {
        _isSpeaking = false;
        window.dispatchEvent(new Event('jarvis-speech-end'));
      };

      speechSynthesis.speak(utterance);
    };

    // Dispatch custom event so UI can react (Arc Reactor glow)
    window.dispatchEvent(new Event('jarvis-speech-start'));
    speakChunk(0);
  },

  stopSpeaking() {
    speechSynthesis.cancel();
    _isSpeaking = false;
    window.dispatchEvent(new Event('jarvis-speech-end'));
  },

  isListening: () => _isListening,
  isSpeaking: () => _isSpeaking,
};

// Preload voices (Chrome loads them async)
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}
