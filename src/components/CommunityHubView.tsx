import { useState, type FormEvent } from 'react';
import { Award, MessageSquare, Plus, ShoppingBag, ThumbsUp, Users } from 'lucide-react';
import type { CityLocation, CommunityPoll, CurrencyCode, Product, SaverProfile } from '../types/shop';
import { formatPrice, getBestNetPriceInr } from '../utils/pricing';

interface CommunityHubViewProps {
  products: Product[];
  polls: CommunityPoll[];
  savers: SaverProfile[];
  currency: CurrencyCode;
  location: CityLocation;
  userDealIq: number;
  votedPolls: Record<string, 'A' | 'B'>;
  onVotePoll: (pollId: string, choice: 'A' | 'B') => Promise<void>;
  onCreatePoll: (optionAId: string, optionBId: string, question: string, context: string) => Promise<void>;
  onOpenProduct: (product: Product) => void;
}

export function CommunityHubView({
  products,
  polls,
  savers,
  currency,
  location,
  userDealIq,
  votedPolls,
  onVotePoll,
  onCreatePoll,
  onOpenProduct,
}: CommunityHubViewProps) {
  const [showNewPoll, setShowNewPoll] = useState(false);
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [optA, setOptA] = useState(products[0]?.id ?? '');
  const [optB, setOptB] = useState(products[1]?.id ?? '');
  const [pollError, setPollError] = useState<string | null>(null);

  const recentNotes = products.flatMap((product) =>
    product.notes.map((note) => ({
      ...note,
      product,
    }))
  );

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!optA || !optB || optA === optB) {
      setPollError('Pick two different products to compare.');
      return;
    }
    setPollError(null);
    await onCreatePoll(
      optA,
      optB,
      question.trim() || 'Which deal gives better value right now?',
      context.trim() || 'Looking for honest shopper feedback before buying.'
    );
    setQuestion('');
    setContext('');
    setShowNewPoll(false);
  }

  return (
    <section className="space-y-8">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-900">Community Deal Squad</h2>
          <p className="text-sm text-slate-600">
            Vote on live shopper polls, share working coupon codes, and build your Deal IQ as you spot lower prices.
          </p>
        </div>

        <div className="flex items-center gap-6 bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 shrink-0">
          <div>
            <div className="text-xs text-slate-500">Your Deal IQ</div>
            <div className="font-mono text-xl font-bold text-blue-600 tabular-nums">{userDealIq} pts</div>
          </div>
          <div className="h-8 w-px bg-slate-200" aria-hidden="true" />
          <div>
            <div className="text-xs text-slate-500">Active Polls</div>
            <div className="font-mono text-xl font-bold text-slate-900 tabular-nums">{polls.length}</div>
          </div>
          <div className="h-8 w-px bg-slate-200" aria-hidden="true" />
          <div>
            <div className="text-xs text-slate-500">Shopper Notes</div>
            <div className="font-mono text-xl font-bold text-slate-900 tabular-nums">{recentNotes.length}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Polls */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>Help Me Pick Polls</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowNewPoll((v) => !v)}
              className="min-h-9 px-3 py-1.5 bg-slate-900 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showNewPoll ? 'Cancel' : 'Start a Poll'}</span>
            </button>
          </div>

          {showNewPoll && (
            <form
              onSubmit={handleCreate}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
            >
              <div className="text-sm font-semibold text-slate-900">Create a Shopping Poll</div>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask the squad (e.g. Best monthly grocery or gadget buy?)"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <input
                type="text"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Short context (optional)"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={optA}
                  onChange={(e) => setOptA(e.target.value)}
                  aria-label="Option A product"
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      Option A: {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={optB}
                  onChange={(e) => setOptB(e.target.value)}
                  aria-label="Option B product"
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      Option B: {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {pollError && <p className="text-xs text-rose-700">{pollError}</p>}
              <button
                type="submit"
                className="min-h-10 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                Publish Poll
              </button>
            </form>
          )}

          <div className="space-y-4">
            {polls.map((poll) => {
              const prodA = products.find((p) => p.id === poll.optionAId);
              const prodB = products.find((p) => p.id === poll.optionBId);
              if (!prodA || !prodB) return null;

              const total = poll.votesA + poll.votesB;
              const pctA = total > 0 ? Math.round((poll.votesA / total) * 100) : 50;
              const pctB = 100 - pctA;
              const userChoice = votedPolls[poll.id];

              return (
                <article
                  key={poll.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                >
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                      <span className="font-medium text-slate-700">{poll.author}</span>
                      <span aria-hidden="true">·</span>
                      <span>{poll.createdAt}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{total} votes</span>
                    </div>
                    <h4 className="text-base font-semibold text-slate-900">{poll.question}</h4>
                    <p className="text-xs text-slate-600">{poll.context}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { choice: 'A' as const, prod: prodA, pct: pctA, votes: poll.votesA },
                      { choice: 'B' as const, prod: prodB, pct: pctB, votes: poll.votesB },
                    ].map(({ choice, prod, pct, votes }) => {
                      const picked = userChoice === choice;
                      return (
                        <button
                          key={choice}
                          type="button"
                          disabled={Boolean(userChoice)}
                          onClick={() => void onVotePoll(poll.id, choice)}
                          className={`text-left border rounded-xl p-3 transition-colors space-y-2 cursor-pointer ${
                            picked
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-slate-50 hover:bg-slate-100 border-slate-200 disabled:cursor-default'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {prod.image ? (
                              <img
                                src={prod.image}
                                alt={prod.name}
                                referrerPolicy="no-referrer"
                                className="w-12 h-12 rounded-lg object-cover bg-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-blue-600 shrink-0">
                                <ShoppingBag className="w-5 h-5" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-slate-900 truncate">
                                {prod.name}
                              </div>
                              <div className="font-mono text-xs text-slate-600 tabular-nums">
                                Best {formatPrice(getBestNetPriceInr(prod, location), currency)}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="h-2 bg-white border border-slate-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  picked ? 'bg-blue-600' : 'bg-slate-700'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-600 tabular-nums">
                              <span>{picked ? 'Your Pick' : `Vote ${choice}`}</span>
                              <span className="font-mono font-medium">
                                {pct}% ({votes})
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* Right: Top Deal Hunters + Latest Shopper Tips */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-600" />
              <span>Top Deal Hunters</span>
            </h3>

            <div className="divide-y divide-slate-100">
              {savers.map((saver, idx) => (
                <div key={saver.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs font-semibold text-slate-400 w-5 tabular-nums">
                      0{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{saver.name}</div>
                      <div className="text-xs text-slate-500">
                        {saver.handle} · {saver.tipsShared} tips
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="text-xs font-semibold text-emerald-700">
                      {formatPrice(saver.totalSavedInr, currency)} saved
                    </div>
                    <div className="text-xs text-slate-500">{saver.dealIq} IQ</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <span>Latest Shopper Coupon Tips</span>
            </h3>

            <div className="space-y-3">
              {recentNotes.slice(0, 6).map((note) => (
                <div
                  key={note.id}
                  className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900">
                      {note.author} <span className="font-normal text-slate-500">{note.handle}</span>
                    </span>
                    <span className="text-slate-400">{note.createdAt}</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{note.text}</p>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenProduct(note.product)}
                      className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
                    >
                      {note.product.name} {note.storeName ? `· ${note.storeName}` : ''}
                    </button>
                    <span className="text-xs text-slate-500 flex items-center gap-1 tabular-nums">
                      <ThumbsUp className="w-3 h-3" />
                      {note.helpfulCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
