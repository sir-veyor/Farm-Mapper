export type ChangeTopic = 'layers' | 'pois' | 'features' | 'rasters' | 'settings';
type Listener = () => void;

const listeners: Record<ChangeTopic, Set<Listener>> = {
  layers: new Set(), pois: new Set(), features: new Set(), rasters: new Set(), settings: new Set(),
};

export function on(topic: ChangeTopic, fn: Listener): () => void {
  listeners[topic].add(fn);
  return () => listeners[topic].delete(fn);
}

export function emit(...topics: ChangeTopic[]): void {
  for (const t of new Set(topics)) for (const fn of [...listeners[t]]) fn();
}
