import { useEffect, useState } from 'react';
import { on, type ChangeTopic } from '../util/events';

/** Runs `load` now and again whenever one of the topics changes. Ignores stale results. */
export function useLive<T>(load: () => Promise<T>, topics: ChangeTopic[], deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let alive = true, seq = 0;
    const run = async () => {
      const n = ++seq;
      try { const r = await load(); if (alive && n === seq) setValue(r); } catch (e) { console.error(e); }
    };
    void run();
    const offs = topics.map((t) => on(t, () => void run()));
    return () => { alive = false; offs.forEach((off) => off()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
