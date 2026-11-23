export class LayerFrozenError extends Error {
  constructor(public layerId: string) { super('Layer is frozen. Thaw it first.'); this.name = 'LayerFrozenError'; }
}
export class LayerLockedError extends Error {
  constructor(public layerId: string) { super('Layer is locked. Unlock it first.'); this.name = 'LayerLockedError'; }
}
export class NotFoundError extends Error {
  constructor(what: string) { super(`${what} not found.`); this.name = 'NotFoundError'; }
}
