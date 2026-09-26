import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Speaking instead of typing.
 *
 * The browser does the listening — Web Speech, the same engine behind the
 * keyboard's dictation key — so nothing is recorded, stored or sent to this
 * app's server. Where it is unavailable, `supported` is false and the caller
 * shows no button: an offer that does nothing is worse than no offer.
 *
 * It never sends what it heard. The words land in the box and the person
 * presses send, because this box can also open a trade, and "I said it out
 * loud" is not the same as "I meant it".
 */

interface SpeechAlternative { transcript: string }
interface SpeechResult { 0: SpeechAlternative; isFinal: boolean; length: number }
interface SpeechEvent { resultIndex: number; results: { length: number; [i: number]: SpeechResult } }
interface SpeechErrorEvent { error: string }

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => Recognition;

const getCtor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export interface Dictation {
  supported: boolean;
  listening: boolean;
  /** Words heard so far in this turn, final and interim together. */
  heard: string;
  error: 'denied' | 'nothing' | null;
  start: () => void;
  stop: () => void;
}

export const useDictation = (lang: string): Dictation => {
  const ctor = useRef<RecognitionCtor | null>(getCtor());
  const rec = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState<'denied' | 'nothing' | null>(null);

  const hardStopAt = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    if (hardStopAt.current) { clearTimeout(hardStopAt.current); hardStopAt.current = null; }
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    // stop() asks politely and waits for the engine to settle; abort() ends
    // it outright. Safari sometimes never fires onend after stop(), which
    // left the button stuck listening — and every further tap started
    // another recognition on top of the last until the page stopped
    // answering at all. Both are called, in that order.
    try { r.stop(); } catch { /* already gone */ }
    setTimeout(() => { try { r.abort(); } catch { /* already gone */ } }, 350);
  }, []);

  const stop = useCallback(() => {
    release();
    setListening(false);
  }, [release]);

  const start = useCallback(() => {
    const Ctor = ctor.current;
    if (!Ctor) return;

    // Never two at once. A second recognition over a live one is what made
    // the page unresponsive: the microphone stays held, and neither session
    // can be stopped by the button.
    release();

    // A fresh one each time: a recognition that has ended cannot be restarted
    // on Safari, and reusing it silently does nothing.
    const r = new Ctor();
    r.lang = lang === 'th' ? 'th-TH' : 'en-US';
    r.continuous = false;
    r.interimResults = true;

    r.onresult = (e: SpeechEvent) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setHeard(text.trim());
    };
    r.onerror = (e: SpeechErrorEvent) => {
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : 'nothing');
      setListening(false);
    };
    r.onend = () => {
      if (hardStopAt.current) { clearTimeout(hardStopAt.current); hardStopAt.current = null; }
      rec.current = null;
      setListening(false);
    };

    setHeard('');
    setError(null);
    rec.current = r;
    try {
      r.start();
      setListening(true);
      // A session that is never ended by the engine — no speech, a lost
      // permission prompt, the screen locking — must not hold the
      // microphone or the button forever.
      hardStopAt.current = setTimeout(() => {
        rec.current = null;
        try { r.stop(); } catch { /* already gone */ }
        try { r.abort(); } catch { /* already gone */ }
        setListening(false);
      }, 15_000);
    } catch {
      // Already running, or refused outright. Either way this attempt is
      // over: leaving the button lit would make it unpressable.
      rec.current = null;
      setListening(false);
    }
  }, [lang, release]);

  // Leaving the screen must not leave the microphone on.
  useEffect(() => () => { release(); }, [release]);

  return { supported: !!ctor.current, listening, heard, error, start, stop };
};
