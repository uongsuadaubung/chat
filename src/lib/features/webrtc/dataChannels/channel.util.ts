import { ctx } from '$lib/features/webrtc/webrtc.context.svelte';
import type { DataChannelPayload } from '$lib/type';
import type { AtomicActionType } from '$lib/features/webrtc/transaction.type';
import { db } from '$lib/core/db';
import { log } from '$lib/core/logger';

export function sendToPeer(
  peerId: string,
  payload: DataChannelPayload,
  options: { skipOutbox?: boolean } = {}
) {
  const channel = ctx.dataChannels.get(peerId);
  if (channel && channel.readyState === 'open') {
    channel.send(JSON.stringify(payload));
  } else if (!options.skipOutbox) {
    // Channel closed - save to transactional_outbox for retry
    // Skip non-critical payloads: typing, read receipts
    if (
      payload.type !== 'typing' &&
      payload.type !== 'message_read' &&
      payload.type !== 'message_read_batch'
    ) {
      saveToTransactionalOutbox(peerId, payload);
    }
  }
}

async function saveToTransactionalOutbox(peerId: string, payload: DataChannelPayload) {
  try {
    await db.transactional_outbox.add({
      peerId,
      actionType: getActionTypeFromPayload(payload),
      payload,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retries: 0,
      maxRetries: 3
    });
    log.dc.info(`[OUTBOX] Saved ${payload.type} to transactional_outbox for ${peerId}`);
  } catch (err) {
    log.dc.error('[OUTBOX] Failed to save to transactional_outbox:', err);
  }
}

function getActionTypeFromPayload(payload: DataChannelPayload): AtomicActionType {
  switch (payload.type) {
    case 'chat':
      return payload.message?.systemEvent ? 'system' : 'chat';
    case 'file_meta':
      return 'file';
    case 'message_pin':
      return 'pin';
    case 'message_edit':
      return 'edit';
    case 'message_delete':
    case 'message_hide_local':
      return 'delete';
    case 'message_react':
      return 'react';
    default:
      return 'chat';
  }
}
