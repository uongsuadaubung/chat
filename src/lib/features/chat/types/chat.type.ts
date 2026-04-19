import { z } from 'zod';

export const FileAttachSchema = z.object({
  name: z.string(),
  size: z.number(),
  mimeType: z.string(),
  url: z.string().optional(),
  progress: z.number().optional(),
  isReceiving: z.boolean().optional(),
  isSending: z.boolean().optional(),
  isPendingDownload: z.boolean().optional(),
  isExpired: z.boolean().optional(),
  error: z.string().optional(),
  transferRate: z.number().optional()
});
export type FileAttach = z.infer<typeof FileAttachSchema>;

export const SystemEventSchema = z.enum([
  'screenShareStart',
  'screenShareStop',
  'callOffer',
  'callAccepted',
  'callDeclined',
  'callBusy',
  'callEnded',
  'messagePinned',
  'messageUnpinned',
  'messageEdited',
  'messageDeleted',
  'messageReacted'
]);
export type SystemEvent = z.infer<typeof SystemEventSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  peerId: z.string(),
  text: z.string().optional(),
  timestamp: z.number(),
  isSelf: z.boolean(),
  type: z.enum(['text', 'file', 'system']).optional(),
  systemEvent: SystemEventSchema.optional(),
  read: z.boolean().optional(),
  file: FileAttachSchema.optional(),
  replyToId: z.string().optional(),
  replyPreview: z.string().optional(),
  isEdited: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  hiddenFromPeers: z.array(z.string()).optional(),
  reactions: z.record(z.string(), z.string()).optional(),
  status: z.enum(['pending', 'sent', 'delivered']).optional(),
  isPending: z.boolean().optional(),
  updatedAt: z.number().optional()
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const PeerUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  connected: z.boolean(),
  hasFailed: z.boolean().optional()
});
export type PeerUser = z.infer<typeof PeerUserSchema>;

export const FileTransferMetaSchema = z.object({
  id: z.string(), // File unique ID
  senderId: z.string(),
  name: z.string(),
  size: z.number(),
  mimeType: z.string(),
  totalChunks: z.number(),
  timestamp: z.number().optional(),
  caption: z.string().optional()
});
export type FileTransferMeta = z.infer<typeof FileTransferMetaSchema>;

export const DataChannelPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chat'),
    message: ChatMessageSchema,
    peerId: z.string()
  }),
  z.object({
    type: z.literal('message_react'),
    messageId: z.string(),
    reaction: z.string(),
    peerId: z.string()
  }),
  z.object({
    type: z.literal('message_delete'),
    messageId: z.string(),
    peerId: z.string()
  }),
  z.object({
    type: z.literal('message_hide_local'),
    messageId: z.string(),
    peerId: z.string()
  }),
  z.object({
    type: z.literal('message_pin'),
    messageId: z.string(),
    isPinned: z.boolean(),
    peerId: z.string()
  }),
  z.object({
    type: z.literal('message_edit'),
    messageId: z.string(),
    newText: z.string(),
    peerId: z.string()
  }),
  z.object({
    type: z.literal('message_read'),
    messageId: z.string(),
    peerId: z.string()
  }),
  z.object({
    type: z.literal('message_read_batch'),
    messageIds: z.array(z.string()),
    peerId: z.string()
  }),
  z.object({
    type: z.literal('file_meta'),
    meta: FileTransferMetaSchema,
    peerId: z.string()
  }),
  z.object({ type: z.literal('file_ack'), id: z.string(), chunkIndex: z.number() }),
  z.object({ type: z.literal('file_request'), id: z.string(), chunkIndices: z.array(z.number()) }),
  z.object({ type: z.literal('file_download_req'), id: z.string() }),
  z.object({ type: z.literal('file_download_abort'), id: z.string() }),
  z.object({
    type: z.literal('typing'),
    peerId: z.string(),
    isTyping: z.boolean()
  }),
  z.object({
    type: z.literal('sync_ready'),
    count: z.number(),
    latestTimestamp: z.number().optional()
  }),
  z.object({ type: z.literal('sync_data'), messages: z.array(ChatMessageSchema) }),
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('pong') })
]);
export type DataChannelPayload = z.infer<typeof DataChannelPayloadSchema>;
