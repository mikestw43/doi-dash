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

  const stop = useCallback(() => {
    rec.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = ctor.current;
    if (!Ctor) return;

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
    r.onend = () => setListening(false);

    setHeard('');
    setError(null);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      // start() throws if one is already running; treat it as already on.
      setListening(true);
    }
  }, [lang]);

  // Leaving the screen must not leave the microphone on.
  useEffect(() => () => { rec.current?.abort(); }, []);

  return { supported: !!ctor.current, listening, heard, error, start, stop };
};
