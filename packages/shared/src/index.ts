// Shared types/contracts between apps/web and apps/server.
// These define the WebSocket event surface for matchmaking, WebRTC
// signaling, and text chat. Implementations land in later phases;
// Phase 1 only establishes the shape of the contract.

// ---- Client -> Server events -----------------------------------------

export interface FindMatchPayload {
  // room for future filters (country, language, interests) - unused in V1
}

export interface SkipPayload {
  matchId: string;
}

export interface SignalPayload {
  matchId: string;
  data: any;
  kind: "offer" | "answer" | "ice-candidate";
}

export interface ChatMessagePayload {
  matchId: string;
  text: string;
}

export interface ReportPayload {
  matchId: string;
  reason: ReportReasonCode;
  description?: string;
}

export interface BlockPayload {
  userId: string;
}

export type ReportReasonCode =
  | "NUDITY_SEXUAL_CONTENT"
  | "HARASSMENT"
  | "HATE_ABUSE"
  | "SPAM_SCAM"
  | "THREATS"
  | "UNDERAGE_CONCERN"
  | "ILLEGAL_ACTIVITY"
  | "OTHER";

// ---- Server -> Client events -------------------------------------------

export type MatchmakingStatus =
  | "searching"
  | "matched"
  | "connecting"
  | "connected"
  | "connection_lost"
  | "partner_disconnected"
  | "no_one_available";

export interface MatchFoundPayload {
  matchId: string;
  // The initiator creates the SDP offer; the other peer waits for it.
  isInitiator: boolean;
}

export interface MatchEndedPayload {
  matchId: string;
  reason: "skipped" | "partner_left" | "reported" | "disconnected" | "timeout";
}

export interface IncomingChatMessage {
  matchId: string;
  text: string;
  sentAt: string; // ISO timestamp
}

export interface ServerErrorPayload {
  code:
    | "UNAUTHENTICATED"
    | "BANNED"
    | "ALREADY_IN_QUEUE"
    | "ALREADY_IN_MATCH"
    | "RATE_LIMITED"
    | "INVALID_INPUT"
    | "INTERNAL_ERROR";
  message: string;
}

// ---- Socket.IO event name constants -----------------------------------

export const SOCKET_EVENTS = {
  // client -> server
  FIND_MATCH: "matchmaking:find",
  CANCEL_FIND: "matchmaking:cancel",
  SKIP: "matchmaking:skip",
  SIGNAL: "webrtc:signal",
  CHAT_MESSAGE: "chat:message",
  REPORT_USER: "safety:report",
  BLOCK_USER: "safety:block",
  END_CHAT: "matchmaking:end",

  // server -> client
  MATCHMAKING_STATUS: "matchmaking:status",
  MATCH_FOUND: "matchmaking:found",
  MATCH_ENDED: "matchmaking:ended",
  SIGNAL_RELAY: "webrtc:signal:relay",
  CHAT_MESSAGE_IN: "chat:message:in",
  ERROR: "error",
} as const;

// ---- Misc shared constants ---------------------------------------------

export const CHAT_MESSAGE_MAX_LENGTH = 500;
export const MATCHMAKING_QUEUE_TIMEOUT_MS = 30_000;
export const MIN_AGE = 18;
