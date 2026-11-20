import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { INDIAN_PLATFORMS } from '../data/catalog';

export function HeroMotionScene() {
  return (
    <div
      className="relative w-full h-44 sm:h-48 bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden flex items-center justify-center select-none"
      aria-hidden="true"
    >
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.35) 1px, transparent 0)',
          backgroundSize: '18px 18px',
        }}
      />

      {/* Animated floating mini deal cards */}
      <motion.div
        animate={{ y: [0, -8, 0], rotate: [-2, 1, -2] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute left-5 sm:left-8 top-6 bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2 flex items-center gap-2"
      >
        <span className="w-2.5 h-2.5 rounded-sm bg-[#F8CB46] shrink-0" />
        <div className="text-xs leading-tight">
          <div className="font-semibold text-slate-900">Blinkit · 10m</div>
          <div className="font-mono text-emerald-700 font-semibold tabular-nums">₹262 net</div>
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, 7, 0], rotate: [2, -1, 2] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        className="absolute right-5 sm:right-8 top-5 bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2 flex items-center gap-2"
      >
        <span className="w-2.5 h-2.5 rounded-sm bg-[#5A189A] shrink-0" />
        <div className="text-xs leading-tight">
          <div className="font-semibold text-slate-900">Zepto · 9m</div>
          <div className="font-mono text-blue-600 font-semibold tabular-nums">ZEPTO23</div>
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, -6, 0], rotate: [1, -2, 1] }}
        transition={{ duration: 2.9, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
        className="absolute left-8 sm:left-14 bottom-4 bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2 flex items-center gap-2"
      >
        <span className="w-2.5 h-2.5 rounded-sm bg-[#D91B5C] shrink-0" />
        <div className="text-xs leading-tight">
          <div className="font-semibold text-slate-900">Flipkart</div>
          <div className="font-mono text-emerald-700 font-semibold tabular-nums">AXIS1500</div>
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, 6, 0], rotate: [-1, 2, -1] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
        className="absolute right-8 sm:right-14 bottom-4 bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2 flex items-center gap-2"
      >
        <span className="w-2.5 h-2.5 rounded-sm bg-[#0284C7] shrink-0" />
        <div className="text-xs leading-tight">
          <div className="font-semibold text-slate-900">Amazon.in</div>
          <div className="font-mono text-slate-700 font-semibold tabular-nums">1-Day Prime</div>
        </div>
      </motion.div>

      {/* Center Animated Shopping Bag + Orbiting Magnifying Glass */}
      <div className="relative z-10 flex items-center justify-center">
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="w-20 h-20 rounded-2xl bg-slate-900 text-white shadow-md flex flex-col items-center justify-center"
        >
          <svg viewBox="0 0 48 48" className="w-11 h-11" fill="none">
            <path
              d="M14 18h20l-2 20H16l-2-20z"
              fill="#2563EB"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            <path
              d="M19 18v-3a5 5 0 0 1 10 0v3"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <text
              x="24"
              y="32"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="12"
              fontWeight="700"
              fontFamily="sans-serif"
            >
              ₹
            </text>
          </svg>
        </motion.div>

        {/* Orbiting / Scanning Magnifier */}
        <motion.div
          animate={{
            x: [-24, 24, -24],
            y: [-10, 12, -10],
            rotate: [-12, 14, -12],
          }}
          transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -right-5 -bottom-3 w-12 h-12 rounded-full bg-white border-2 border-blue-600 shadow-md flex items-center justify-center"
        >
          <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
            <circle cx="14" cy="14" r="7" stroke="#2563EB" strokeWidth="2.6" fill="#EFF6FF" />
            <path d="M19.5 19.5L26 26" stroke="#D97706" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M11 14h6M14 11v6" stroke="#059669" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </motion.div>
      </div>
    </div>
  );
}

const SEARCH_MESSAGES = [
  'Scanning Blinkit, Zepto & Swiggy Instamart...',
  'Checking Flipkart, Amazon.in & Croma stock...',
  'Applying instant coupons & bank cashback offers...',
  'Sorting lowest final price for your location...',
];

export function SearchingMotionLoader({ query }: { query: string }) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setMsgIdx((prev) => (prev + 1) % SEARCH_MESSAGES.length);
    }, 1100);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center space-y-5 overflow-hidden"
    >
      {/* Racing Scooter / Cart Animation Track */}
      <div className="relative w-full max-w-md h-16 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex items-center px-4">
        <motion.div
          animate={{ x: [-40, 360] }}
          transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut' }}
          className="flex items-center gap-2"
        >
          <svg viewBox="0 0 56 36" className="w-14 h-9" fill="none">
            <rect x="4" y="6" width="24" height="16" rx="4" fill="#2563EB" />
            <text
              x="16"
              y="18"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="10"
              fontWeight="700"
              fontFamily="sans-serif"
            >
              %
            </text>
            <path
              d="M28 22h14l4-8h6"
              stroke="#0F172A"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="14" cy="27" r="5" fill="#0F172A" />
            <circle cx="14" cy="27" r="2" fill="#FFFFFF" />
            <circle cx="42" cy="27" r="5" fill="#0F172A" />
            <circle cx="42" cy="27" r="2" fill="#FFFFFF" />
          </svg>
        </motion.div>

        {/* Speed lines */}
        <motion.div
          animate={{ opacity: [0.2, 0.8, 0.2], x: [0, -16, 0] }}
          transition={{ duration: 0.9, repeat: Infinity }}
          className="ml-auto flex gap-1.5"
        >
          <span className="w-5 h-1 bg-blue-300 rounded-full" />
          <span className="w-3 h-1 bg-emerald-400 rounded-full" />
        </motion.div>
      </div>

      {/* Platform Ping Row */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {INDIAN_PLATFORMS.slice(0, 7).map((plat, idx) => (
          <motion.div
            key={plat.id}
            animate={{ y: [0, -5, 0], scale: [1, 1.06, 1] }}
            transition={{
              duration: 1.1,
              repeat: Infinity,
              delay: idx * 0.14,
              ease: 'easeInOut',
            }}
            style={{ backgroundColor: plat.bgHex, color: plat.textHex }}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold shadow-xs"
          >
            {plat.name}
          </motion.div>
        ))}
      </div>

      <div className="space-y-1">
        <div className="text-base font-semibold text-slate-900">
          Finding live prices & coupons for &ldquo;{query}&rdquo;
        </div>
        <motion.div
          key={msgIdx}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-slate-500"
        >
          {SEARCH_MESSAGES[msgIdx]}
        </motion.div>
      </div>
    </div>
  );
}
