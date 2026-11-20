import { create } from 'zustand';

export interface Toast { id: number; text: string; kind: 'info' | 'error' | 'success' }
export type Panel = 'layers' | 'gps' | null;
export type Selection = { kind: 'poi' | 'feature'; id: string };
export type Tool = { type: 'none' } | { type: 'addPoi' } | { type: 'movePoi'; id: string };
interface ConfirmReq { message: string; okLabel: string; resolve: (ok: boolean) => void }

interface UiState {
  toasts: Toast[];
  importOpen: boolean;
  exportOpen: boolean;
  backupOpen: boolean;
  panel: Panel;
  selection: Selection | null;
  tool: Tool;
  follow: boolean;
  confirmReq: ConfirmReq | null;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  setImportOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  setBackupOpen: (open: boolean) => void;
  setPanel: (p: Panel) => void;
  select: (s: Selection | null) => void;
  setTool: (t: Tool) => void;
  setFollow: (f: boolean) => void;
  confirm: (message: string, okLabel?: string) => Promise<boolean>;
  resolveConfirm: (ok: boolean) => void;
}

let nextId = 1;

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  importOpen: false,
  exportOpen: false,
  backupOpen: false,
  panel: null,
  selection: null,
  tool: { type: 'none' },
  follow: false,
  confirmReq: null,
  toast: (text, kind = 'info') => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 9000 : 5000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setImportOpen: (importOpen) => set({ importOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setBackupOpen: (backupOpen) => set({ backupOpen }),
  setPanel: (panel) => set({ panel, selection: panel ? null : get().selection }),
  select: (selection) => set({ selection, panel: selection ? null : get().panel }),
  setTool: (tool) => set({ tool }),
  setFollow: (follow) => set({ follow }),
  confirm: (message, okLabel = 'Delete') =>
    new Promise<boolean>((resolve) => set({ confirmReq: { message, okLabel, resolve } })),
  resolveConfirm: (ok) => { get().confirmReq?.resolve(ok); set({ confirmReq: null }); },
}));

/** Run an async action; show any error as a toast instead of an unhandled rejection. */
export async function act<T>(p: Promise<T> | (() => Promise<T>)): Promise<T | undefined> {
  try { return await (typeof p === 'function' ? p() : p); }
  catch (e) { useUi.getState().toast((e as Error).message || 'Something went wrong.', 'error'); return undefined; }
}
