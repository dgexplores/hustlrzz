"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Browser-only speech support (STT via webkit SpeechRecognition, TTS via SpeechSynthesis).
const SR = typeof window !== "undefined"
  ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  : undefined;

/**
 * Rank installed TTS voices so the interviewer sounds as human as the platform
 * allows: prefer neural/natural voices, then high-quality Google/Apple voices.
 */
const rankVoice = (voice: SpeechSynthesisVoice): number => {
  const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  let score = 0;
  if (name.includes("natural") || name.includes("neural")) score += 100;
  if (name.includes("premium") || name.includes("enhanced")) score += 60;
  if (name.includes("google")) score += 50;
  if (name.includes("samantha") || name.includes("aria") || name.includes("jenny")) score += 40;
  if (voice.lang.startsWith("en")) score += 30;
  if (name.includes("compact") || name.includes("espeak")) score -= 40;
  if (!voice.localService) score += 8; // cloud voices usually sound better
  return score;
};

/** Split text into sentence-ish chunks so speech gets natural micro-pauses. */
const chunkForSpeech = (text: string): string[] => {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length > 220) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current = (current + " " + sentence).trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.length ? chunks : [text];
};

export function useAudio(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const queueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const speakingRef = useRef(false);
  // Chrome ends SpeechRecognition after a silence gap; while the user intends
  // to stay on mic we restart it automatically for a natural conversation flow.
  const shouldListenRef = useRef(false);
  const cachedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const supported = !!SR && typeof window !== "undefined" && "speechSynthesis" in window;

  const refreshCachedVoice = useCallback(() => {
    if (!supported) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    cachedVoiceRef.current = [...voices].sort((a, b) => rankVoice(b) - rankVoice(a))[0] || null;
  }, [supported]);

  const pickVoice = useCallback((): SpeechSynthesisVoice | null => cachedVoiceRef.current, []);

  // Warm the voice list (Chrome loads it asynchronously) and cache the ranked choice.
  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    refreshCachedVoice();
    synth.addEventListener?.("voiceschanged", refreshCachedVoice);
    return () => {
      synth.removeEventListener?.("voiceschanged", refreshCachedVoice);
      synth.cancel();
    };
  }, [supported, refreshCachedVoice]);

  const stopSpeaking = useCallback(() => {
    if (!supported) return;
    queueRef.current = [];
    window.speechSynthesis.cancel();
    speakingRef.current = false;
    setSpeaking(false);
  }, [supported]);

  /** Speak a full message with human cadence: queued chunks + micro-pauses. */
  const speak = useCallback((text: string) => {
    if (!supported || !text) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    queueRef.current = [];
    const voice = pickVoice();
    const chunks = chunkForSpeech(text);
    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = "en-US";
      utterance.rate = index === 0 ? 1.02 : 1.04;
      utterance.pitch = 1.0;
      utterance.volume = 1;
      if (voice) utterance.voice = voice;
      if (index === chunks.length - 1) {
        utterance.onend = () => {
          speakingRef.current = false;
          setSpeaking(false);
        };
        utterance.onerror = () => {
          speakingRef.current = false;
          setSpeaking(false);
        };
      }
      queueRef.current.push(utterance);
    });
    // Speak sequentially with a small breath between sentences.
    const speakNext = (index: number) => {
      if (index >= queueRef.current.length) {
        speakingRef.current = false;
        setSpeaking(false);
        return;
      }
      const utterance = queueRef.current[index];
      utterance.onend = () => {
        window.setTimeout(() => speakNext(index + 1), 140);
      };
      utterance.onerror = () => speakNext(index + 1);
      if (index === 0) {
        speakingRef.current = true;
        setSpeaking(true);
      }
      synth.speak(utterance);
    };
    speakingRef.current = true;
    setSpeaking(true);
    speakNext(0);
  }, [supported, pickVoice]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
      recRef.current = null;
    }
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    if (!supported || !SR) return;
    stopSpeaking(); // barge-in: candidate talks, interviewer pauses
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
      recRef.current = null;
    }
    setError(null);
    setInterim("");
    shouldListenRef.current = true;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      const interimParts: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal && text) {
          onTranscriptRef.current(text);
        } else if (text) interimParts.push(text);
      }
      setInterim(interimParts.join(" "));
    };
    rec.onend = () => {
      setListening(false); setInterim("");
      if (shouldListenRef.current) {
        window.setTimeout(() => {
          if (!shouldListenRef.current) return;
          try {
            rec.start();
            setListening(true);
          } catch {}
        }, 300);
      } else {
        recRef.current = null;
      }
    };
    rec.onerror = (event: any) => {
      const messages: Record<string, string> = {
        "not-allowed": "Microphone permission is blocked. Allow it in the browser address bar and retry.",
        "audio-capture": "No microphone is available. Check your input device and browser permissions.",
        network: "Speech recognition lost its network connection. Your typed transcript is still available.",
        "no-speech": "No speech was detected. Move closer to the microphone and try again.",
      };
      // Transient errors keep the auto-restart loop alive; fatal ones do not.
      const transient = event?.error === "no-speech" || event?.error === "aborted" || event?.error === "network";
      if (!transient) {
        setError(messages[event?.error] || "Voice recognition stopped unexpectedly. You can continue by typing.");
        shouldListenRef.current = false;
      }
      setListening(false); setInterim("");
    };
    rec.start();
    recRef.current = rec;
    setListening(true);
  }, [supported, stopSpeaking]);

  useEffect(() => () => {
    shouldListenRef.current = false;
    stop();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [stop]);

  return useMemo(
    () => ({ supported, listening, speaking, interim, error, start, stop, speak, stopSpeaking }),
    [supported, listening, speaking, interim, error, start, stop, speak, stopSpeaking],
  );
}
