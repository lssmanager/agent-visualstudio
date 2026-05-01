import { Injectable } from '@nestjs/common';

@Injectable()
export class AgentResolverService {
  private readonly cache = new Map<string, unknown>();

  invalidateCache(channelConfigId?: string): void {
    if (channelConfigId) {
      this.cache.delete(channelConfigId);
      return;
    }

    this.cache.clear();
  }
}
