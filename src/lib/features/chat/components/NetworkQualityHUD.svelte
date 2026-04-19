<script lang="ts">
  import SignalIcon from '$lib/shared/components/icons/SignalIcon.svelte';
  import { networkQualityStore } from '$lib/features/webrtc/stores/networkQuality.store.svelte';

  interface Props {
    peerId: string;
  }

  let { peerId }: Props = $props();

  $effect(() => {
    networkQualityStore.watch(peerId);
  });

  $effect(() => {
    return () => {
      networkQualityStore.stop();
    };
  });

  let quality = $derived(networkQualityStore.get(peerId));

  function formatBandwidth(kbps: number): string {
    if (kbps >= 1000) {
      return (kbps / 1000).toFixed(1) + 'Mbps';
    }
    if (kbps > 0) {
      return kbps + 'Kbps';
    }
    return '--';
  }
</script>

{#if quality && quality.rtt > 0}
  <div
    class="network-hud"
    title="Ping: {quality.rtt}ms | Send: {formatBandwidth(
      quality.sendBitrate
    )} | Recv: {formatBandwidth(quality.recvBitrate)}"
  >
    <SignalIcon size={14} />
    <span class="ping">{quality.rtt}ms</span>
    <span class="bandwidth">↑{formatBandwidth(quality.sendBitrate)}</span>
    <span class="bandwidth">↓{formatBandwidth(quality.recvBitrate)}</span>
  </div>
{/if}

<style lang="scss">
  .network-hud {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    color: var(--text-muted);
    user-select: none;
  }

  .ping {
    font-weight: 600;
    color: var(--text-main);
  }

  .bandwidth {
    color: var(--text-muted);
  }
</style>
