import { useCallback, useEffect, useRef, useState } from 'react';

interface Fields { name: string; notes: string }

/** Local text state for name/notes that saves after a short pause and when the editor closes. */
export function useAutoSaved(initial: Fields | undefined, save: (diff: Partial<Fields>) => Promise<unknown>, enabled: boolean) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const saved = useRef<Fields | null>(null);
  const latest = useRef<Fields>({ name: '', notes: '' });
  const skip = useRef(false);

  useEffect(() => {
    if (initial && !saved.current) { saved.current = { ...initial }; setName(initial.name); setNotes(initial.notes); latest.current = { ...initial }; }
  }, [initial]);

  latest.current = { name, notes };

  const saveRef = useRef(save);
  saveRef.current = save;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const flush = useCallback(() => {
    const s = saved.current;
    if (!s || !enabledRef.current || skip.current) return;
    const l = latest.current, diff: Partial<Fields> = {};
    if (l.name !== s.name && l.name.trim()) diff.name = l.name;
    if (l.notes !== s.notes) diff.notes = l.notes;
    if (!Object.keys(diff).length) return;
    saved.current = { ...s, ...diff };
    void saveRef.current(diff);
  }, []);

  useEffect(() => { const t = setTimeout(flush, 600); return () => clearTimeout(t); }, [name, notes, flush]);
  useEffect(() => () => flush(), [flush]);

  return { name, notes, setName, setNotes, flush, discard: () => { skip.current = true; } };
}
