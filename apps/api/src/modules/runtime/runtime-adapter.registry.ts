import { RuntimeAdapter } from './runtime-adapter.interface';
import { OpenClawRuntimeAdapter } from './adapters/openclaw-runtime.adapter';
import { NativeRuntimeAdapter } from './native-runtime.adapter';

export class RuntimeAdapterRegistry {
  private readonly adapters = new Map<string, RuntimeAdapter>();
  private activeAdapterName: string;

  constructor(defaultAdapter?: RuntimeAdapter) {
    if (defaultAdapter) {
      this.register(defaultAdapter);
      this.activeAdapterName = defaultAdapter.name;
      return;
    }

    const openClawAdapter = new OpenClawRuntimeAdapter();
    this.register(openClawAdapter);
    this.activeAdapterName = openClawAdapter.name;

    // Also register the native adapter so it can be selected without OpenClaw
    const nativeAdapter = new NativeRuntimeAdapter();
    this.register(nativeAdapter);
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
