"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Browser-only speech support (STT via webkit SpeechRecognition, TTS via SpeechSynthesis).
const SR = typeof window !== "undefined"
  ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  : undefined;

export function useAudio(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);

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
    setInterim("");
  }, []);

  const start = useCallback(() => {
    if (!supported || !SR) return;
    if (recRef.current) stop();
    setError(null);
    setInterim("");
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      const interimParts: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal && text) {
          onTranscript(text);
        } else if (text) interimParts.push(text);
      }
      setInterim(interimParts.join(" "));
    };
    rec.onend = () => { setListening(false); setInterim(""); recRef.current = null; };
    rec.onerror = (event: any) => {
      const messages: Record<string, string> = {
        "not-allowed": "Microphone permission is blocked. Allow it in the browser address bar and retry.",
        "audio-capture": "No microphone is available. Check your input device and browser permissions.",
        network: "Speech recognition lost its network connection. Your typed transcript is still available.",
        "no-speech": "No speech was detected. Move closer to the microphone and try again.",
      };
      setError(messages[event?.error] || "Voice recognition stopped unexpectedly. You can continue by typing.");
      setListening(false); setInterim(""); recRef.current = null;
    };
    rec.start();
    recRef.current = rec;
    setListening(true);
  }, [supported, stop, onTranscript]);

  useEffect(() => () => stop(), [stop]);

  return { supported, listening, interim, error, start, stop, speak };
}
