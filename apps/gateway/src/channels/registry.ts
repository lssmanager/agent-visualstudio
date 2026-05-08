/**
 * registry.ts - registro singleton de IChannelAdapter
 */
import type { IChannelAdapter } from './channel-adapter.interface'

class AdapterRegistry {
  private readonly adapters = new Map<string, IChannelAdapter>()

  register(type: string, adapter: IChannelAdapter): void {
    this.adapters.set(type, adapter)
  }

  has(type: string): boolean {
    return this.adapters.has(type)
  }

  get(type: string): IChannelAdapter {
    const adapter = this.adapters.get(type)
    if (!adapter) {
      throw new Error(
        `[AdapterRegistry] No adapter for '${type}'. Registered: ${this.registeredTypes().join(', ') || '(none)'}`,
      )
    }
    return adapter
  }

  registeredTypes(): string[] {
    return [...this.adapters.keys()]
  }
}

export const registry = new AdapterRegistry()
