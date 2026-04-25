/**
 * runtime-adapter.registry.ts — Registro de RuntimeAdapters
 *
 * Cuando NATIVE_RUNTIME=true, registra NativeRuntimeAdapter como default.
 * Mantiene OpenClawRuntimeAdapter como fallback para transición.
 */

import { RuntimeAdapter } from './runtime-adapter.interface';
import { OpenClawRuntimeAdapter } from './adapters/openclaw-runtime.adapter';
import { NativeRuntimeAdapter } from './adapters/native-runtime.adapter';

export class RuntimeAdapterRegistry {
  private readonly adapters = new Map<string, RuntimeAdapter>();
  private activeAdapterName: string;

  constructor(defaultAdapter?: RuntimeAdapter) {
    // Registrar siempre ambos adaptadores
    const openClawAdapter = new OpenClawRuntimeAdapter();
    const nativeAdapter = new NativeRuntimeAdapter();
    this.register(openClawAdapter);
    this.register(nativeAdapter);

    if (defaultAdapter) {
      this.register(defaultAdapter);
      this.activeAdapterName = defaultAdapter.name;
      return;
    }

    // Seleccionar adaptador activo según env
    if (process.env.NATIVE_RUNTIME === 'true') {
      this.activeAdapterName = nativeAdapter.name;
      console.info('[RuntimeAdapterRegistry] Using NativeRuntimeAdapter (NATIVE_RUNTIME=true)');
    } else {
      this.activeAdapterName = openClawAdapter.name;
      console.info('[RuntimeAdapterRegistry] Using OpenClawRuntimeAdapter (NATIVE_RUNTIME not set)');
    }
  }

  register(adapter: RuntimeAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  setActive(name: string): void {
    if (!this.adapters.has(name)) {
      throw new Error(`Runtime adapter not registered: ${name}`);
    }
    this.activeAdapterName = name;
  }

  getActive(): RuntimeAdapter {
    const adapter = this.adapters.get(this.activeAdapterName);
    if (!adapter) {
      throw new Error(`Active runtime adapter not found: ${this.activeAdapterName}`);
    }
    return adapter;
  }

  list(): string[] {
    return Array.from(this.adapters.keys());
  }
}

export const runtimeAdapterRegistry = new RuntimeAdapterRegistry();
