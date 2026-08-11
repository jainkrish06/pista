"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { io, Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@pista/shared";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

interface Message {
  id: string;
  sender: "me" | "partner" | "system";
  text: string;
  sentAt: string;
}

export default function ChatPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; displayName: string } | null>(null);

  // Matchmaking State
  const [status, setStatus] = useState<"idle" | "searching" | "matched" | "no_one_available">("idle");
  const [matchId, setMatchId] = useState<string | null>(null);

  // Audio/Video control states
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  // Media Streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [showChatMobile, setShowChatMobile] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // WebRTC & Socket Refs
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset unread count when chat is opened
  useEffect(() => {
    if (showChatMobile) {
      setUnreadCount(0);
    }
  }, [showChatMobile]);

  // Check auth and consents on entry
  useEffect(() => {
    const verifyUserStatus = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/auth/me`, {
          credentials: "include",
        });

        if (!res.ok) {
          router.push("/login?redirect=/chat");
          return;
        }

        const data = await res.json();
        const required = ["AGE_CONFIRMATION", "TERMS_OF_SERVICE", "PRIVACY_POLICY", "COMMUNITY_GUIDELINES"];
        const hasAll = required.every((reqType) =>
          (data.consents || []).some((c: { type: string }) => c.type === reqType)
        );

        if (!hasAll) {
          router.push("/age-gate");
          return;
        }

        setUser({ id: data.id, displayName: data.profile.displayName });

        // Initialize user media stream
        await initializeMedia();

        setLoading(false);
      } catch (err) {
        router.push("/login");
      }
    };

    verifyUserStatus();

    return () => {
      cleanupMedia();
      cleanupPeerConnection();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [router]);

  // Connect Socket.IO after authentication load is complete
  useEffect(() => {
    if (!user) return;

    // Connect to WebSocket server using cookie credentials
    const socket = io(SERVER_URL, {
      withCredentials: true,
      transports: ["websocket"],
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("WebSocket connected:", socket.id);
    });

    // Listen to matchmaking status updates
    socket.on(SOCKET_EVENTS.MATCHMAKING_STATUS, (newStatus: any) => {
      setStatus(newStatus);
      if (newStatus === "searching" || newStatus === "no_one_available" || newStatus === "idle") {
        cleanupPeerConnection();
      }
    });

    // Match Found -> Establish PeerConnection
    socket.on(SOCKET_EVENTS.MATCH_FOUND, async (payload: { matchId: string; isInitiator: boolean }) => {
      const { matchId: newMatchId, isInitiator } = payload;
      setMatchId(newMatchId);
      setStatus("matched");
      setMessages([{
        id: "sys-matched",
        sender: "system",
        text: "Connected with a vetted partner! Say hello.",
        sentAt: new Date().toISOString(),
      }]);
      setUnreadCount(0);

      const pc = createPeerConnection(newMatchId, isInitiator);

      if (isInitiator) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit(SOCKET_EVENTS.SIGNAL, {
            matchId: newMatchId,
            kind: "offer",
            data: offer,
          });
        } catch (err) {
          console.error("Failed to create offer:", err);
        }
      }
    });

    // WebRTC Signaling Relay
    socket.on(SOCKET_EVENTS.SIGNAL_RELAY, async (payload: { matchId: string; kind: string; data: any }) => {
      const { matchId: incomingMatchId, kind, data } = payload;
      try {
        if (kind === "offer") {
          const pc = createPeerConnection(incomingMatchId, false);
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit(SOCKET_EVENTS.SIGNAL, {
            matchId: incomingMatchId,
            kind: "answer",
            data: answer,
          });
        } else if (kind === "answer") {
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data));
          }
        } else if (kind === "ice-candidate") {
          if (pcRef.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(data));
          }
        }
      } catch (err) {
        console.error("Error handling relayed signal:", err);
      }
    });

    // Partner Left / Disconnected
    socket.on(SOCKET_EVENTS.MATCH_ENDED, (payload: { matchId: string; reason: string }) => {
      cleanupPeerConnection();
      setStatus("idle");
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-ended-${Date.now()}`,
          sender: "system",
          text: `Chat ended: ${payload.reason === "skipped" ? "Partner skipped" : "Partner left the conversation"}`,
          sentAt: new Date().toISOString(),
        },
      ]);
    });

    // Listen to incoming chat messages
    socket.on(SOCKET_EVENTS.CHAT_MESSAGE_IN, (payload: { matchId: string; text: string; sentAt: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-partner-${Date.now()}`,
          sender: "partner",
          text: payload.text,
          sentAt: payload.sentAt,
        },
      ]);
      // If mobile chat drawer is closed, increment unread count
      if (!showChatMobile) {
        setUnreadCount((prev) => prev + 1);
      }
    });

    // Global Error listener
    socket.on(SOCKET_EVENTS.ERROR, (err: { code: string; message: string }) => {
      console.error("Socket error:", err);
    });

    return () => {
      socket.disconnect();
    };
  }, [user, showChatMobile]);

  // Request camera and microphone access
  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: true,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera/microphone:", err);
      alert("PISTA requires camera and microphone permissions to start video chat.");
    }
  };

  // Turn off local video/audio tracks
  const cleanupMedia = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
  };

  // Close and clean up the current WebRTC PeerConnection
  const cleanupPeerConnection = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    setMatchId(null);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  // Configure PeerConnection and event handlers
  const createPeerConnection = (mId: string, isInitiator: boolean): RTCPeerConnection => {
    cleanupPeerConnection();

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    pcRef.current = pc;

    // Attach local stream tracks to WebRTC
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit(SOCKET_EVENTS.SIGNAL, {
          matchId: mId,
          kind: "ice-candidate",
          data: event.candidate,
        });
      }
    };

    // Track handler (captures remote video)
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };

    // Handle abrupt WebRTC disconnection states
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        cleanupPeerConnection();
        setStatus("idle");
      }
    };

    return pc;
  };

  // UI Control actions
  const handleToggleMic = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setMicMuted(!micMuted);
    }
  };

  const handleToggleCamera = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setCameraOff(!cameraOff);
    }
  };

  const handleStartSearching = () => {
    if (socketRef.current) {
      socketRef.current.emit(SOCKET_EVENTS.FIND_MATCH);
    }
  };

  const handleCancelSearching = () => {
    if (socketRef.current) {
      socketRef.current.emit(SOCKET_EVENTS.CANCEL_FIND);
    }
  };

  const handleSkipPartner = () => {
    if (socketRef.current) {
      socketRef.current.emit(SOCKET_EVENTS.SKIP);
      cleanupPeerConnection();
    }
  };

  const handleEndSession = () => {
    if (socketRef.current) {
      socketRef.current.emit(SOCKET_EVENTS.END_CHAT);
      cleanupPeerConnection();
      setStatus("idle");
    }
  };

  // Send message over Socket.IO and update local UI
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    if (socketRef.current && matchId) {
      socketRef.current.emit(SOCKET_EVENTS.CHAT_MESSAGE, {
        matchId,
        text: inputText,
      });
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `msg-me-${Date.now()}`,
        sender: "me",
        text: inputText,
        sentAt: new Date().toISOString(),
      },
    ]);
    setInputText("");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent mx-auto"></div>
          <p className="text-sm font-medium tracking-wide">Configuring camera access and safety keys...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans relative">
      
      {/* LEFT / CENTER: Video Layout stage */}
      <div className="relative flex flex-1 flex-col bg-zinc-950 h-full overflow-hidden">
        
        {/* Floating Top Header Overlay */}
        <div className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between pointer-events-none">
          {/* Logo & Status Badge */}
          <div className="flex items-center space-x-3 pointer-events-auto bg-zinc-900/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-zinc-800 shadow-lg">
            <span className="text-sm font-black tracking-wider text-indigo-500">PISTA</span>
            <div className="h-4 w-[1px] bg-zinc-800" />
            <div className="flex items-center space-x-2">
              <span className={`h-2 w-2 rounded-full ${
                status === "matched" ? "bg-emerald-500 animate-pulse" :
                status === "searching" ? "bg-indigo-500 animate-pulse" :
                status === "no_one_available" ? "bg-amber-500" : "bg-zinc-500"
              }`} />
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                {status === "matched" ? "Matched" :
                 status === "searching" ? "Queueing" :
                 status === "no_one_available" ? "No matches" : "Idle"}
              </span>
            </div>
          </div>

          {/* Exit Link */}
          <div className="pointer-events-auto">
            <Link
              href="/"
              onClick={cleanupMedia}
              className="flex items-center space-x-1.5 bg-zinc-900/80 backdrop-blur-md hover:bg-zinc-800 px-4 py-2 rounded-full border border-zinc-800 hover:border-zinc-700 shadow-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Exit Chat</span>
            </Link>
          </div>
        </div>

        {/* Video feed container */}
        <div className="relative flex-1 bg-zinc-900 overflow-hidden flex items-center justify-center">
          {status === "matched" && remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover transform scale-x-[-1] absolute inset-0"
            />
          ) : (
            // Matching screen placeholders
            <div className="flex flex-col items-center justify-center space-y-6 text-center px-6 max-w-sm z-10">
              {status === "searching" ? (
                <>
                  <div className="relative flex items-center justify-center h-24 w-24">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-500/20 opacity-75"></span>
                    <div className="relative flex items-center justify-center h-16 w-16 rounded-full bg-indigo-600 border border-indigo-500 shadow-indigo-600/30 shadow-lg text-white font-extrabold text-sm tracking-widest">
                      PISTA
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-base font-bold text-indigo-400">Finding your connection...</h2>
                    <p className="text-xs text-zinc-500 leading-relaxed">Waiting for a verified community member. Safe and completely anonymous.</p>
                  </div>
                </>
              ) : status === "no_one_available" ? (
                <>
                  <div className="h-14 w-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 text-lg font-bold">
                    !
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-base font-bold text-amber-500">No compatible peers</h2>
                    <p className="text-xs text-zinc-500 leading-relaxed">All compatible users are currently in chats. Try starting the queue again in a few moments.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-14 w-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 text-lg font-bold">
                    ★
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-base font-bold text-zinc-300">Start matchmaking</h2>
                    <p className="text-xs text-zinc-500 leading-relaxed">Click the button below to join the random chat pool. Verify camera permissions before starting.</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Picture in Picture: Local Video Feed */}
          <div className="absolute bottom-6 right-6 h-28 w-36 sm:h-36 sm:w-48 overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950 shadow-2xl z-20">
            {cameraOff ? (
              <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-xs font-semibold text-zinc-600">
                Camera Off
              </div>
            ) : (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover transform scale-x-[-1]"
              />
            )}
            <div className="absolute bottom-2 left-2 rounded bg-zinc-950/70 backdrop-blur-sm px-1.5 py-0.5 text-[9px] text-zinc-400 font-bold uppercase tracking-wider">
              You
            </div>
          </div>
        </div>

        {/* Action Controls dock bar */}
        <div className="h-24 border-t border-zinc-900/60 bg-zinc-950 flex items-center justify-between px-6 z-30">
          
          {/* Left: Device mute toggles */}
          <div className="flex items-center space-x-3.5">
            {/* Audio Toggle */}
            <button
              onClick={handleToggleMic}
              className={`flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-250 ${
                micMuted
                  ? "bg-red-950/40 border-red-900/60 text-red-400 hover:bg-red-900/60 shadow-lg shadow-red-950/20"
                  : "bg-zinc-900/80 border-zinc-800/80 text-zinc-300 hover:bg-zinc-800 shadow-md"
              }`}
              title={micMuted ? "Unmute Mic" : "Mute Mic"}
            >
              {micMuted ? (
                <svg className="h-4.5 w-4.5 fill-current" viewBox="0 0 24 24"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.34 3 3 3 .74 0 1.41-.27 1.93-.71l3.06 3.06c-.84.48-1.81.76-2.85.81v3.13h-2v-3.13c-2.45-.11-4.48-1.5-5.25-3.56H5c.78 2.62 3.08 4.59 5.86 4.96v3.13h2v-3.13c1.78-.06 3.44-.54 4.88-1.35l2.87 2.87 1.27-1.27L4.27 3z" /></svg>
              ) : (
                <svg className="h-4.5 w-4.5 fill-current" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" /></svg>
              )}
            </button>

            {/* Video Toggle */}
            <button
              onClick={handleToggleCamera}
              className={`flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-250 ${
                cameraOff
                  ? "bg-red-950/40 border-red-900/60 text-red-400 hover:bg-red-900/60 shadow-lg shadow-red-950/20"
                  : "bg-zinc-900/80 border-zinc-800/80 text-zinc-300 hover:bg-zinc-800 shadow-md"
              }`}
              title={cameraOff ? "Turn Camera On" : "Turn Camera Off"}
            >
              {cameraOff ? (
                <svg className="h-4.5 w-4.5 fill-current" viewBox="0 0 24 24"><path d="M18 10.48V6c0-1.1-.9-2-2-2H6.83l2 2H16v7.17l2 2v-1.65l4 3.98v-11l-4 3.98zm-13.75-6.2L3 5.55l3.22 3.22c-.13.39-.22.8-.22 1.23v8c0 1.1.9 2 2 2h8c.43 0 .84-.09 1.23-.22L20.45 21l1.27-1.27-17.47-17.45zM8 11.17L12.83 16H8v-4.83z" /></svg>
              ) : (
                <svg className="h-4.5 w-4.5 fill-current" viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" /></svg>
              )}
            </button>

            {/* Mobile Chat drawer toggle button */}
            <button
              onClick={() => setShowChatMobile(true)}
              className="relative flex md:hidden h-11 w-11 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 shadow-md transition-all"
              title="Open Chat"
            >
              <svg className="h-4.5 w-4.5 stroke-current fill-none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 border-2 border-zinc-950 text-[10px] font-black text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Right: Main Queue / Skipping actions */}
          <div className="flex items-center space-x-3.5">
            {status === "matched" ? (
              <>
                <button
                  onClick={handleEndSession}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-850 px-4.5 py-3 text-xs font-bold text-zinc-300 transition duration-200"
                >
                  End Chat
                </button>
                <button
                  onClick={handleSkipPartner}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-600/30 hover:shadow-lg px-7 py-3 text-xs font-black text-white transition duration-200 flex items-center space-x-2"
                >
                  <span>Skip Partner</span>
                  <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 20 20"><path d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" /></svg>
                </button>
              </>
            ) : status === "searching" ? (
              <button
                onClick={handleCancelSearching}
                className="rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 px-6 py-3 text-xs font-bold text-zinc-300 transition duration-200"
              >
                Cancel Search
              </button>
            ) : (
              <button
                onClick={handleStartSearching}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-600/30 hover:shadow-lg px-8 py-3 text-xs font-black text-white transition duration-200"
              >
                Start Chatting
              </button>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR / OVERLAY drawer: Text Chat Interface */}
      <div className={`
        w-80 border-l border-zinc-900/60 bg-zinc-950 flex flex-col h-full z-40 transition-all duration-300
        ${showChatMobile 
          ? "absolute inset-0 w-full" 
          : "hidden md:flex relative"}
      `}>
        {/* Header bar */}
        <div className="h-16 px-4 border-b border-zinc-900/60 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center space-x-2">
            <span className={`h-2 w-2 rounded-full ${status === "matched" ? "bg-emerald-500 animate-pulse" : "bg-zinc-700"}`} />
            <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">Live Conversation</span>
          </div>

          {/* Close button for Mobile Drawer view */}
          <button
            onClick={() => setShowChatMobile(false)}
            className="block md:hidden text-zinc-500 hover:text-zinc-300 transition"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Message Log logs view */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col min-h-0 bg-zinc-950/40">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-600 space-y-3">
              <svg className="h-7 w-7 stroke-current" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-[11px] leading-relaxed max-w-xs">No messages yet. Once matching connects you, say hello to kickstart the conversation.</p>
            </div>
          ) : (
            messages.map((msg) => {
              if (msg.sender === "system") {
                return (
                  <div key={msg.id} className="text-center py-1.5">
                    <span className="inline-block rounded-lg bg-zinc-900 border border-zinc-800 px-2.5 py-1 text-[9px] text-zinc-400 tracking-wide font-medium">
                      {msg.text}
                    </span>
                  </div>
                );
              }

              const isMe = msg.sender === "me";
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[85%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
                >
                  <div
                    className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow ${
                      isMe
                        ? "bg-indigo-600 text-white rounded-tr-none"
                        : "bg-zinc-900 border border-zinc-850 text-zinc-200 rounded-tl-none"
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-zinc-600 mt-1 px-1">
                    {new Date(msg.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input box Form footer */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-zinc-900 bg-zinc-950 flex space-x-2 bg-zinc-950">
          <input
            type="text"
            disabled={status !== "matched"}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={status === "matched" ? "Type a message..." : "Waiting to match..."}
            className="flex-1 rounded-xl bg-zinc-900 border border-zinc-800 px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          />
          <button
            type="submit"
            disabled={status !== "matched" || !inputText.trim()}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md shadow-indigo-600/10"
          >
            <svg className="h-4 w-4 fill-current rotate-45" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </form>
      </div>

    </div>
  );
}
