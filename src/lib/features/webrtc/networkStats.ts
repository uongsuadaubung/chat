import { ctx } from './webrtc.context.svelte';
import { log } from '$lib/core/logger';

export interface NetworkQuality {
  rtt: number;
  sendBitrate: number;
  recvBitrate: number;
  packetsLost: number;
}

const POLL_INTERVAL_MS = 2000;
const WINDOW_SIZE = 3;

const previousStats: Map<string, { bytesSent: number; bytesReceived: number; timestamp: number }> =
  new Map();
const bitrateHistory: Map<string, number[]> = new Map();
let pollInterval: ReturnType<typeof setInterval> | null = null;

export async function getNetworkStats(peerId: string): Promise<NetworkQuality | null> {
  const pc = ctx.connections.get(peerId);
  if (!pc) return null;

  try {
    const stats = await pc.getStats();
    let rtt = 0;
    let totalBytesSent = 0;
    let totalBytesReceived = 0;

    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        if (report.currentRoundTripTime) {
          rtt = Math.round(report.currentRoundTripTime * 1000);
        }
      }

      if (report.type === 'outbound-rtp' && (report.kind === 'video' || report.kind === 'audio')) {
        totalBytesSent += Number(report.bytesSent) || 0;
      }
      if (report.type === 'inbound-rtp' && (report.kind === 'video' || report.kind === 'audio')) {
        totalBytesReceived += Number(report.bytesReceived) || 0;
      }

      if (report.type === 'transport') {
        totalBytesSent += Number(report.bytesSent) || 0;
        totalBytesReceived += Number(report.bytesReceived) || 0;
      }
    });

    const now = Date.now();
    const prev = previousStats.get(peerId);

    let sendBitrate = 0;
    let recvBitrate = 0;

    if (prev) {
      const timeDeltaSeconds = (now - prev.timestamp) / 1000;
      if (timeDeltaSeconds > 0) {
        const bytesSentDelta = totalBytesSent - prev.bytesSent;
        const bytesReceivedDelta = totalBytesReceived - prev.bytesReceived;

        sendBitrate = Math.round((bytesSentDelta * 8) / timeDeltaSeconds / 1000);
        recvBitrate = Math.round((bytesReceivedDelta * 8) / timeDeltaSeconds / 1000);
      }
    }

    previousStats.set(peerId, {
      bytesSent: totalBytesSent,
      bytesReceived: totalBytesReceived,
      timestamp: now
    });

    const history = bitrateHistory.get(peerId) || [];
    history.push(sendBitrate);
    if (history.length > WINDOW_SIZE) history.shift();
    bitrateHistory.set(peerId, history);

    const avgSendBitrate =
      history.length > 0
        ? Math.round(history.reduce((a, b) => a + b, 0) / history.length)
        : sendBitrate;

    return { rtt, sendBitrate: avgSendBitrate, recvBitrate, packetsLost: 0 };
  } catch (err) {
    log.webrtc.error(`Lỗi lấy stats từ ${peerId}:`, err);
    return null;
  }
}

export function startMonitoring(peerId: string, onUpdate: (quality: NetworkQuality) => void): void {
  stopMonitoring();

  const poll = async () => {
    const quality = await getNetworkStats(peerId);
    if (quality) {
      onUpdate(quality);
    }
  };

  poll();
  pollInterval = setInterval(poll, POLL_INTERVAL_MS);
}

export function stopMonitoring(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
