import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Bot,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { ChatMessage, CityLocation, CurrencyCode, Product } from '../types/shop';
import { formatPrice, getBestOffer, getNetCost } from '../utils/pricing';

interface AiAssistantViewProps {
  products: Product[];
  location: CityLocation;
  maxBudgetInr: number | null;
  currency: CurrencyCode;
  onOpenProduct: (product: Product) => void;
}

const STARTER_CHAT_PROMPTS = [
  'What is the best coupon deal on iPhone 15 right now?',
  'Compare BoAt earbuds vs Elara ANC headphones — worth buying now or wait?',
  'Plan a student backpack + keyboard + skincare combo under ₹12,000',
  'Where can I get Amul butter and sunscreen delivered fastest?',
];

const VOICE_QUICK_TOPICS = [
  'Find me the best smartphone deal under 60,000 rupees',
  'Which platform has the cheapest running shoes right now?',
  'Should I buy the Philips air fryer today or wait for a drop?',
];

function floatTo16BitPcmBase64(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm24kToAudioBuffer(ctx: AudioContext, base64: string): AudioBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const audioBuffer = ctx.createBuffer(1, sampleCount, 24000);
  const channel = audioBuffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    channel[i] = view.getInt16(i * 2, true) / 32768;
  }
  return audioBuffer;
}

export function AiAssistantView({
  products,
  location,
  maxBudgetInr,
  currency,
  onOpenProduct,
}: AiAssistantViewProps) {
  const [assistantMode, setAssistantMode] = useState<'chat' | 'voice'>('chat');

  // --- Text Chatbot State ---
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Namaste! I'm your SavvyCart Shopping Assistant for ${location.city} (${location.pincode}). Ask me for quick coupon codes, budget bundles, or deep side-by-side comparisons across all 11 Indian platforms—I'll automatically pick the right reasoning speed and depth for your question.`,
      timestamp: 'Now',
      routeLabel: 'General Advisor',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // --- Live Voice State ---
  const [voiceStatus, setVoiceStatus] = useState<
    'idle' | 'connecting' | 'listening' | 'speaking' | 'error'
  >('idle');
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceTranscripts, setVoiceTranscripts] = useState<
    Array<{ id: string; speaker: 'You' | 'SavvyCart Voice'; text: string }>
  >([]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const mutedRef = useRef<boolean>(false);

  useEffect(() => {
    mutedRef.current = voiceMuted;
  }, [voiceMuted]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, chatLoading]);

  const stopVoiceSession = () => {
    try {
      activeSourcesRef.current.forEach((src) => {
        try {
          src.stop();
        } catch {
          // ignore
        }
      });
      activeSourcesRef.current = [];
      nextStartTimeRef.current = 0;

      processorRef.current?.disconnect();
      processorRef.current = null;

      sourceNodeRef.current?.disconnect();
      sourceNodeRef.current = null;

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      inputAudioCtxRef.current?.close().catch(() => {});
      inputAudioCtxRef.current = null;

      outputAudioCtxRef.current?.close().catch(() => {});
      outputAudioCtxRef.current = null;

      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
      }
      wsRef.current = null;
    } finally {
      setVoiceStatus('idle');
      setVoiceMuted(false);
    }
  };

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, []);

  async function sendChatMessage(textToSend?: string) {
    const clean = (textToSend ?? chatInput).trim();
    if (!clean || chatLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: clean,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!textToSend) setChatInput('');
    setChatLoading(true);
    setChatError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory
            .filter((m) => m.id !== 'welcome')
            .map((m) => ({ role: m.role, text: m.text })),
          location: { city: location.city, pincode: location.pincode },
          maxBudgetInr: maxBudgetInr ?? undefined,
          currency,
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        recommendedProductIds?: string[];
        routeModel?: string;
        routeLabel?: ChatMessage['routeLabel'];
        error?: string;
      };

      if (!res.ok || !data.reply) {
        setChatError(data.error ?? 'Could not get a response from Gemini shopping advisor.');
      } else {
        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          routeModel: data.routeModel,
          routeLabel: data.routeLabel,
          recommendedProductIds: data.recommendedProductIds ?? [],
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch {
      setChatError('Network error reaching Gemini shopping assistant.');
    } finally {
      setChatLoading(false);
    }
  }

  function handleChatSubmit(e: FormEvent) {
    e.preventDefault();
    void sendChatMessage();
  }

  function handleResetChat() {
    setChatError(null);
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        text: `Fresh session ready for ${location.city} (${location.pincode}). Tell me what you're shopping for or your target budget!`,
        timestamp: 'Now',
        routeLabel: 'General Advisor',
      },
    ]);
  }

  async function startVoiceSession() {
    if (voiceStatus === 'connecting' || voiceStatus === 'listening' || voiceStatus === 'speaking') {
      return;
    }

    setVoiceError(null);
    setVoiceStatus('connecting');
    setVoiceTranscripts([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({
        city: location.city,
        pincode: location.pincode,
        currency,
      });
      if (maxBudgetInr) params.set('budget', String(maxBudgetInr));

      const ws = new WebSocket(`${proto}//${window.location.host}/ws/live?${params.toString()}`);
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        sourceNodeRef.current = source;
        processorRef.current = processor;

        source.connect(processor);
        processor.connect(inputCtx.destination);

        processor.onaudioprocess = (ev) => {
          if (mutedRef.current || ws.readyState !== WebSocket.OPEN) return;
          const samples = ev.inputBuffer.getChannelData(0);
          const base64 = floatTo16BitPcmBase64(samples);
          ws.send(JSON.stringify({ type: 'audio', data: base64 }));
        };
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type?: string;
            data?: string;
            text?: string;
            message?: string;
          };

          if (msg.type === 'ready') {
            setVoiceStatus('listening');
          } else if (msg.type === 'audio' && msg.data && outputAudioCtxRef.current) {
            setVoiceStatus('speaking');
            const ctx = outputAudioCtxRef.current;
            if (ctx.state === 'suspended') {
              void ctx.resume();
            }
            const buffer = base64Pcm24kToAudioBuffer(ctx, msg.data);
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.connect(ctx.destination);

            const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
            src.start(startAt);
            nextStartTimeRef.current = startAt + buffer.duration;
            activeSourcesRef.current.push(src);

            src.onended = () => {
              activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== src);
              if (activeSourcesRef.current.length === 0) {
                setVoiceStatus((prev) => (prev === 'speaking' ? 'listening' : prev));
              }
            };
          } else if (msg.type === 'interrupted') {
            activeSourcesRef.current.forEach((src) => {
              try {
                src.stop();
              } catch {
                // ignore
              }
            });
            activeSourcesRef.current = [];
            nextStartTimeRef.current = 0;
            setVoiceStatus('listening');
          } else if (msg.type === 'inputTranscript' && msg.text) {
            const spoken = msg.text.trim();
            if (spoken) {
              setVoiceTranscripts((prev) => [
                ...prev.slice(-18),
                { id: `in-${Date.now()}-${Math.random()}`, speaker: 'You', text: spoken },
              ]);
            }
          } else if (msg.type === 'outputTranscript' && msg.text) {
            const replyText = msg.text.trim();
            if (replyText) {
              setVoiceTranscripts((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.speaker === 'SavvyCart Voice') {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, text: `${last.text} ${replyText}`.trim() },
                  ];
                }
                return [
                  ...prev.slice(-18),
                  { id: `out-${Date.now()}-${Math.random()}`, speaker: 'SavvyCart Voice', text: replyText },
                ];
              });
            }
          } else if (msg.type === 'turnComplete') {
            if (activeSourcesRef.current.length === 0) {
              setVoiceStatus((prev) => (prev === 'speaking' ? 'listening' : prev));
            }
          } else if (msg.type === 'error') {
            setVoiceError(msg.message ?? 'Live voice session encountered an error.');
            setVoiceStatus('error');
          } else if (msg.type === 'closed') {
            stopVoiceSession();
          }
        } catch {
          // ignore malformed frame
        }
      };

      ws.onerror = () => {
        setVoiceError('Could not connect to live voice server.');
        stopVoiceSession();
        setVoiceStatus('error');
      };

      ws.onclose = () => {
        setVoiceStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
      };
    } catch (err) {
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Microphone access is required for live voice conversations.'
      );
      stopVoiceSession();
      setVoiceStatus('error');
    }
  }

  function sendVoiceTextPrompt(prompt: string) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text: prompt }));
      setVoiceTranscripts((prev) => [
        ...prev,
        { id: `in-${Date.now()}`, speaker: 'You', text: prompt },
      ]);
    }
  }

  const isVoiceActive =
    voiceStatus === 'connecting' || voiceStatus === 'listening' || voiceStatus === 'speaking';

  return (
    <section className="space-y-6">
      {/* Assistant Header & Mode Switch */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-medium text-blue-600 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Auto-Routed Gemini Shopping Advisor &amp; Live Voice</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">SavvyCart AI Assistant</h2>
          <p className="text-sm text-slate-600 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              {location.city} ({location.pincode})
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-emerald-700 font-medium">
              {maxBudgetInr ? `Max budget: ${formatPrice(maxBudgetInr, currency)}` : 'Flexible budget'}
            </span>
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setAssistantMode('chat')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              assistantMode === 'chat'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Gemini Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setAssistantMode('voice')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              assistantMode === 'voice'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Voice Conversation</span>
          </button>
        </div>
      </div>

      {assistantMode === 'chat' ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
          {/* Chat Top Bar */}
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Automatically switches between fast coupon answers and deep multi-store analysis
            </span>
            <button
              type="button"
              onClick={handleResetChat}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Thread</span>
            </button>
          </div>

          {/* Scrollable Message Thread */}
          <div
            ref={chatScrollRef}
            className="p-5 space-y-4 h-[440px] overflow-y-auto bg-white"
          >
            {messages.map((msg) => {
              const linkedProducts = (msg.recommendedProductIds ?? [])
                .map((id) => products.find((p) => p.id === id))
                .filter((p): p is Product => Boolean(p));

              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 space-y-2.5 ${
                      msg.role === 'user'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-800'
                    }`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Bot className="w-3.5 h-3.5 text-blue-600" />
                        <span className="font-semibold text-slate-800">SavvyCart AI</span>
                        {msg.routeLabel && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-blue-600 font-medium">{msg.routeLabel}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{msg.timestamp}</span>
                      </div>
                    )}

                    <p className="text-sm leading-relaxed whitespace-pre-line">{msg.text}</p>

                    {linkedProducts.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {linkedProducts.map((prod) => {
                          const best = getBestOffer(prod, 'lowest-price', location);
                          const net = getNetCost(best);
                          return (
                            <button
                              key={prod.id}
                              type="button"
                              onClick={() => onOpenProduct(prod)}
                              className="text-left bg-white hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-xl p-2.5 transition-colors cursor-pointer"
                            >
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                {prod.name}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center justify-between gap-2 mt-1">
                                <span className="font-mono font-bold text-emerald-700 tabular-nums">
                                  {formatPrice(net, currency)} · {best.storeName}
                                </span>
                                <span className="text-blue-600 font-medium inline-flex items-center gap-0.5">
                                  Compare <ArrowRight className="w-3 h-3" />
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-600 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  <span>Comparing prices, coupons, and 30-day trends...</span>
                </div>
              </div>
            )}
          </div>

          {/* Starter Prompts */}
          <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 mr-1">Try asking:</span>
            {STARTER_CHAT_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={chatLoading}
                onClick={() => void sendChatMessage(prompt)}
                className="text-[11px] px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-md text-slate-700 transition-colors cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>

          {chatError && (
            <div className="px-5 py-2 bg-rose-50 border-t border-rose-200 text-xs text-rose-700">
              {chatError}
            </div>
          )}

          {/* Chat Composer */}
          <form onSubmit={handleChatSubmit} className="p-4 border-t border-slate-200 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about any product, coupon hack, combo under budget, or whether to buy now..."
              aria-label="Ask SavvyCart shopping assistant"
              className="flex-1 h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="h-11 px-5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <span>Send</span>
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      ) : (
        /* Real-Time Voice Conversation Mode (gemini-3.8-live) */
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="relative flex items-center justify-center w-28 h-28">
              {isVoiceActive && (
                <span
                  className={`absolute inset-0 rounded-full animate-ping opacity-25 ${
                    voiceStatus === 'speaking' ? 'bg-emerald-500' : 'bg-blue-500'
                  }`}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  if (isVoiceActive) {
                    stopVoiceSession();
                  } else {
                    void startVoiceSession();
                  }
                }}
                className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105 cursor-pointer ${
                  voiceStatus === 'speaking'
                    ? 'bg-emerald-600'
                    : voiceStatus === 'listening'
                      ? 'bg-blue-600'
                      : voiceStatus === 'connecting'
                        ? 'bg-slate-600'
                        : 'bg-slate-900 hover:bg-blue-600'
                }`}
                aria-label={isVoiceActive ? 'End voice conversation' : 'Start voice conversation'}
              >
                {voiceStatus === 'connecting' ? (
                  <Loader2 className="w-9 h-9 animate-spin" />
                ) : voiceStatus === 'speaking' ? (
                  <Volume2 className="w-9 h-9" />
                ) : (
                  <Mic className="w-9 h-9" />
                )}
              </button>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900">
                {voiceStatus === 'idle' && 'Start a Real-Time Voice Conversation'}
                {voiceStatus === 'connecting' && 'Connecting microphone & live audio...'}
                {voiceStatus === 'listening' && 'Listening — speak naturally about what you need'}
                {voiceStatus === 'speaking' && 'SavvyCart Voice is speaking — interrupt anytime'}
                {voiceStatus === 'error' && 'Voice connection interrupted'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Powered by Gemini Live (`gemini-3.8-live`) · 16kHz voice capture &amp; 24kHz real-time responses aware of {location.city} ({location.pincode})
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {!isVoiceActive ? (
                <button
                  type="button"
                  onClick={() => void startVoiceSession()}
                  className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  <span>Start Voice Call</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setVoiceMuted((m) => !m)}
                    className={`h-10 px-4 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer ${
                      voiceMuted
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {voiceMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    <span>{voiceMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopVoiceSession}
                    className="h-10 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>End Voice Call</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {voiceError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-xs text-center">
              {voiceError}
            </div>
          )}

          {isVoiceActive && (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-[11px] text-slate-500 mr-1">Or tap a topic to ask aloud:</span>
              {VOICE_QUICK_TOPICS.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => sendVoiceTextPrompt(topic)}
                  className="text-[11px] px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md text-slate-700 cursor-pointer"
                >
                  {topic}
                </button>
              ))}
            </div>
          )}

          {/* Live Transcripts Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 min-h-[160px] max-h-[260px] overflow-y-auto">
            <div className="text-xs font-semibold text-slate-700">Live Voice Transcript</div>
            {voiceTranscripts.length === 0 ? (
              <p className="text-xs text-slate-400">
                {isVoiceActive
                  ? 'Start speaking—your live questions and spoken deal answers will appear here.'
                  : 'Click "Start Voice Call" to talk hands-free with SavvyCart Voice.'}
              </p>
            ) : (
              <div className="space-y-2">
                {voiceTranscripts.map((entry) => (
                  <div key={entry.id} className="text-xs leading-relaxed">
                    <span
                      className={`font-semibold mr-1.5 ${
                        entry.speaker === 'You' ? 'text-slate-900' : 'text-blue-700'
                      }`}
                    >
                      {entry.speaker}:
                    </span>
                    <span className="text-slate-700">{entry.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
