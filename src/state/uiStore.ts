import { create } from 'zustand';

export interface Toast { id: number; text: string; kind: 'info' | 'error' | 'success' }

interface UiState {
  toasts: Toast[];
  importOpen: boolean;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  setImportOpen: (open: boolean) => void;
}

let nextId = 1;

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  importOpen: false,
  toast: (text, kind = 'info') => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 9000 : 5000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setImportOpen: (importOpen) => set({ importOpen }),
}));
