"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Browser-only speech support (STT via webkit SpeechRecognition, TTS via SpeechSynthesis).
const SR = typeof window !== "undefined"
  ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  : undefined;

export function useAudio(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const finalRef = useRef("");

  const supported = !!SR && "speechSynthesis" in window;

  const speak = useCallback((text: string) => {
    if (!supported || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }, [supported]);

  const stop = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
      recRef.current = null;
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!supported || !SR) return;
    if (recRef.current) stop();
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal && text) {
          onTranscript(text);
        }
      }
    };
    rec.onend = () => { setListening(false); recRef.current = null; };
    rec.onerror = () => { setListening(false); recRef.current = null; };
    rec.start();
    recRef.current = rec;
    setListening(true);
  }, [supported, SR, stop, onTranscript]);

  useEffect(() => () => stop(), [stop]);

  return { supported, listening, start, stop, speak };
}
