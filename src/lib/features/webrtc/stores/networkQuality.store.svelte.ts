import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import {
  startMonitoring,
  stopMonitoring,
  type NetworkQuality
} from '$lib/features/webrtc/networkStats';

let currentPeerId: string | null = null;

export class NetworkQualityStore {
  quality: Record<string, NetworkQuality> = $state({});

  watch(peerId: string | null): void {
    if (currentPeerId === peerId) return;

    if (currentPeerId) {
      stopMonitoring();
      delete this.quality[currentPeerId];
    }

    if (peerId && ctx.connections.has(peerId)) {
      currentPeerId = peerId;
      startMonitoring(peerId, (q) => {
        this.quality[peerId] = q;
      });
    }

    currentPeerId = peerId;
  }

  stop(): void {
    stopMonitoring();
    currentPeerId = null;
  }

  get(peerId: string): NetworkQuality | undefined {
    return this.quality[peerId];
  }
}

export const networkQualityStore = new NetworkQualityStore();
