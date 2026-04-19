// ========================
// SIGNALING PROTOCOL — Type-safe discriminated union
// Dùng cho tín hiệu trao đổi qua Firebase Realtime Database
// ========================

import { z } from 'zod';

export const RTCSessionDescriptionInitSchema = z.object({
  type: z.enum(['answer', 'offer', 'pranswer', 'rollback']),
  sdp: z.string().optional()
}) as z.ZodType<RTCSessionDescriptionInit>;

export const RTCIceCandidateInitSchema = z.object({
  candidate: z.string().optional(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().nullable().optional(),
  usernameFragment: z.string().nullable().optional()
}) as z.ZodType<RTCIceCandidateInit>;

export const SignalBaseSchema = z.object({
  senderId: z.string(),
  timestamp: z.number()
});

export const SignalSchema = z.discriminatedUnion('type', [
  SignalBaseSchema.extend({
    type: z.literal('offer'),
    sdp: RTCSessionDescriptionInitSchema
  }),
  SignalBaseSchema.extend({
    type: z.literal('answer'),
    sdp: RTCSessionDescriptionInitSchema
  }),
  SignalBaseSchema.extend({
    type: z.literal('candidate'),
    candidate: RTCIceCandidateInitSchema
  }),
  SignalBaseSchema.extend({
    type: z.literal('reconnect_req')
  })
]);

export type Signal = z.infer<typeof SignalSchema>;

export type SignalPayload =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }
  | { type: 'reconnect_req' };
