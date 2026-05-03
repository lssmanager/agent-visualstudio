/**
 * useFlowSave
 *
 * Persiste un FlowSpec en BD vía PUT /api/studio/v1/flows/:id.
 * Comportamiento:
 *   - Debounce de 1200ms: llama a saveFlow() 1.2s después del último cambio.
 *   - Save manual: expone `saveNow()` para Ctrl+S y botón de toolbar.
 *   - Estado visual: 'idle' | 'saving' | 'saved' | 'error'
 *   - savedAt: Date | null — timestamp del último guardado exitoso.
 *
 * Uso:
 *   const { saveState, savedAt, saveNow } = useFlowSave(flow);
 *   // Montar en el componente padre del canvas (StudioCanvas).
 *   // Pasar saveState a CanvasToolbar para el indicador visual.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { saveFlow } from '../../../lib/api';
import type { FlowSpec } from '../../../lib/types';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface UseFlowSaveResult {
  saveState: SaveState;
  savedAt:   Date | null;
  saveNow:   () => Promise<void>;
  lastError: string | null;
}

const DEBOUNCE_MS = 1200;

export function useFlowSave(flow: FlowSpec | null): UseFlowSaveResult {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt,   setSavedAt]   = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Ref para el timer de debounce — se cancela en cada nuevo cambio.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref para saber si ya hay un save en curso y no lanzar otro.
  const saving = useRef(false);
  // Ref para skip del primer render (no guardar al montar).
  const isFirstRender = useRef(true);

  const doSave = useCallback(async (f: FlowSpec) => {
    if (saving.current) return;
    saving.current = true;
    setSaveState('saving');
    setLastError(null);
    try {
      await saveFlow(f);
      setSaveState('saved');
      setSavedAt(new Date());
    } catch (err) {
      setSaveState('error');
      setLastError((err as Error).message);
    } finally {
      saving.current = false;
    }
  }, []);

  // Debounce: cada vez que cambia `flow`, reiniciar el timer.
  // Saltar el primer render para no guardar en el montaje inicial.
  useEffect(() => {
    if (!flow) return;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Resetear indicador visual si ya había terminado.
    if (saveState === 'saved' || saveState === 'error') {
      setSaveState('idle');
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void doSave(flow);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow]);   // ← intencionalmente solo [flow]

  // Save manual (Ctrl+S o botón de toolbar).
  const saveNow = useCallback(async () => {
    if (!flow) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    await doSave(flow);
  }, [flow, doSave]);

  return { saveState, savedAt, saveNow, lastError };
}
