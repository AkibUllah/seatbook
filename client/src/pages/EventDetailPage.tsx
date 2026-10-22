import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../api';
import { getUser } from '../session';

interface Seat {
  id: number;
  row: number;
  col: number;
  label: string;
  status: 'available' | 'held' | 'booked';
  mine: boolean;
  available: boolean;
}

interface Hold {
  id: number;
  seatId: number;
  label: string;
  expiresAt: string;
}

interface EventDetail {
  id: number;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  price: string;
  priceCents: number;
  organizer: { id: number; name: string };
  seats: Seat[];
  myHolds: Hold[];
  holdMinutes: number;
  maxHolds: number;
  serverTime: string;
}

// how often to pick up other people's holds and bookings
const REFRESH_MS = 15_000;

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function seatClass(seat: Seat, isPast: boolean) {
  if (seat.status === 'held' && seat.mine) {
    return 'bg-gradient-to-br from-[#ec4899] to-[#f97316] shadow-lg shadow-pink-500/50 scale-110 cursor-pointer';
  }
  if (seat.status === 'booked' && seat.mine) {
    return 'bg-gradient-to-br from-[#22c55e] to-[#16a34a] cursor-default';
  }
  if (seat.status === 'held') {
    return 'bg-[#f59e0b]/25 text-white/40 border border-dashed border-[#f59e0b]/50 cursor-not-allowed';
  }
  if (seat.status === 'booked' || isPast) {
    return 'bg-gradient-to-br from-[#a855f7]/20 to-[#6366f1]/20 text-white/30 cursor-not-allowed';
  }
  return 'bg-gradient-to-br from-[#a855f7]/60 to-[#6366f1]/60 hover:from-[#a855f7] hover:to-[#6366f1] hover:scale-110 cursor-pointer';
}

export default function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = getUser();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busySeat, setBusySeat] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // server clock minus ours; the countdown follows the server, which decides expiry
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  // polls and post-action refreshes overlap; only the newest response may update the page
  const latestFetch = useRef(0);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    clearTimeout(toastTimer.current);
    setToast({ type, message });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchEvent = useCallback(async () => {
    const fetchId = ++latestFetch.current;
    try {
      const data = await api<EventDetail>(`/events/${id}`);
      if (fetchId !== latestFetch.current) return;
      setClockOffset(new Date(data.serverTime).getTime() - Date.now());
      setNow(Date.now());
      setEvent(data);
      setLoadError('');
    } catch (err) {
      if (fetchId !== latestFetch.current) return;
      setLoadError(err instanceof ApiError && err.status === 404 ? 'Event not found' : errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    fetchEvent();
    const timer = setInterval(fetchEvent, REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchEvent]);

  const holdCount = event?.myHolds.length ?? 0;

  // tick once a second while there is a countdown to show
  useEffect(() => {
    if (holdCount === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [holdCount]);

  const serverNow = now + clockOffset;
  const liveHolds = event?.myHolds.filter((h) => new Date(h.expiresAt).getTime() > serverNow) ?? [];
  const expiredCount = holdCount - liveHolds.length;

  useEffect(() => {
    if (expiredCount > 0) {
      showToast('error', 'Your hold ran out and the seat went back on sale');
      fetchEvent();
    }
  }, [expiredCount, fetchEvent, showToast]);

  const holdSeat = async (seat: Seat) => {
    setBusySeat(seat.id);
    try {
      await api('/holds', { method: 'POST', body: { seatId: seat.id } });
    } catch (err) {
      showToast('error', errorMessage(err));
    }
    await fetchEvent();
    setBusySeat(null);
  };

  const releaseHold = async (hold: Hold) => {
    setBusySeat(hold.seatId);
    try {
      await api(`/holds/${hold.id}`, { method: 'DELETE' });
    } catch (err) {
      showToast('error', errorMessage(err));
    }
    await fetchEvent();
    setBusySeat(null);
  };

  const handleSeatClick = (seat: Seat) => {
    if (busySeat !== null || confirming) return;

    if (!user) {
      navigate('/login');
      return;
    }
    if (user.role !== 'ATTENDEE') {
      showToast('error', 'Organizer accounts can’t book seats. Sign up as an attendee to book.');
      return;
    }

    const hold = liveHolds.find((h) => h.seatId === seat.id);
    if (hold) {
      releaseHold(hold);
    } else if (seat.available) {
      holdSeat(seat);
    }
  };

  const confirmHolds = async () => {
    setConfirming(true);
    const results = await Promise.allSettled(
      liveHolds.map((h) => api(`/holds/${h.id}/confirm`, { method: 'POST' }))
    );
    const booked = liveHolds.filter((_, i) => results[i].status === 'fulfilled').map((h) => h.label);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');

    if (failed) {
      const prefix = booked.length ? `Booked ${booked.join(', ')}, but: ` : '';
      showToast('error', prefix + errorMessage(failed.reason));
    } else {
      showToast('success', `🎉 Booked! Seat${booked.length > 1 ? 's' : ''} ${booked.join(', ')} ${booked.length > 1 ? 'are' : 'is'} yours.`);
    }
    await fetchEvent();
    setConfirming(false);
  };

  if (!event) {
    if (loadError) {
      return (
        <div className="text-center py-32 text-white/60">
          <div className="text-6xl">🤷</div>
          <p className="mt-4">{loadError}</p>
          <Link to="/" className="text-[#a855f7]">
            Back to events →
          </Link>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-16 h-16 border-4 border-[#ec4899] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-6 text-white/60 animate-pulse">Loading event... 🎭</p>
      </div>
    );
  }

  const rows: Seat[][] = [];
  event.seats.forEach((seat) => {
    (rows[seat.row] ??= []).push(seat);
  });

  const isPast = new Date(event.startsAt).getTime() <= serverNow;
  const availableCount = event.seats.filter((s) => s.available).length;
  const percentTaken = Math.round(((event.seats.length - availableCount) / event.seats.length) * 100);
  const total = (event.priceCents * liveHolds.length) / 100;

  return (
    <div>
      {toast && (
        <div
          role="status"
          className={`fixed top-24 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl font-medium max-w-md ${
            toast.type === 'success'
              ? 'bg-gradient-to-r from-[#22c55e] to-[#16a34a]'
              : 'bg-gradient-to-r from-[#ef4444] to-[#dc2626]'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="rounded-3xl p-10 bg-gradient-to-br from-[#a855f7]/30 via-[#ec4899]/20 to-[#f97316]/20 border border-white/10 glow">
        <span className="px-3 py-1 rounded-full bg-[#a855f7]/30 text-[#d8b4fe] text-xs font-bold">
          {isPast ? '⏰ ENDED' : '✨ UPCOMING'}
        </span>
        <h1 className="mt-4 text-5xl font-extrabold">{event.title}</h1>
        <p className="mt-4 text-white/60 text-lg">{event.description}</p>
        <div className="mt-6 flex gap-6 text-white/70">
          <span>📍 {event.venue}</span>
          <span>
            📅 {new Date(event.startsAt).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
          </span>
          <span>👤 {event.organizer.name}</span>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-3 gap-8">
        <div className="col-span-2 glass rounded-3xl p-8">
          <h2 className="text-2xl font-bold mb-2">
            Choose Your <span className="gradient-text">Perfect Seat</span> 🪑
          </h2>
          <p className="text-white/50 mb-6">
            {isPast
              ? 'This event has already started.'
              : `${availableCount} of ${event.seats.length} available · ${percentTaken}% taken 🔥`}
          </p>
          <div className="w-full h-2 rounded-full bg-gradient-to-r from-[#a855f7] to-[#ec4899] mb-10 opacity-60"></div>
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="flex gap-3 justify-center">
                {row.map((seat) => (
                  <button
                    key={seat.id}
                    type="button"
                    onClick={() => handleSeatClick(seat)}
                    disabled={!seat.available && !(seat.status === 'held' && seat.mine)}
                    aria-label={`Seat ${seat.label}, ${seat.mine ? `${seat.status} by you` : seat.status}`}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-300 ${seatClass(
                      seat,
                      isPast
                    )} ${busySeat === seat.id ? 'animate-pulse' : ''}`}
                  >
                    {seat.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-5 text-xs text-white/60">
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-gradient-to-br from-[#a855f7]/60 to-[#6366f1]/60"></span>Available
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-gradient-to-br from-[#ec4899] to-[#f97316]"></span>Held by you
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-[#f59e0b]/25 border border-dashed border-[#f59e0b]/50"></span>Held by
              someone else
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-gradient-to-br from-[#22c55e] to-[#16a34a]"></span>Your booking
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-gradient-to-br from-[#a855f7]/20 to-[#6366f1]/20"></span>Booked
            </span>
          </div>
        </div>

        <div className="glass rounded-3xl p-8 h-fit">
          <h3 className="text-xl font-bold mb-2">Your Seats 🧾</h3>
          <p className="text-sm text-white/50 mb-6">
            Pick up to {event.maxHolds} seats. Each is held for you for {event.holdMinutes} minutes, and nobody else can
            take it until then. Click a held seat to let it go.
          </p>

          {liveHolds.length === 0 ? (
            <p className="text-white/40 text-center py-6">No seats held yet</p>
          ) : (
            <ul className="space-y-3">
              {liveHolds.map((h) => {
                const msLeft = new Date(h.expiresAt).getTime() - serverNow;
                return (
                  <li key={h.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                    <span className="font-bold">💺 {h.label}</span>
                    <span
                      className={`font-mono tabular-nums ${msLeft < 60_000 ? 'text-[#fca5a5] animate-pulse' : 'text-white/70'}`}
                      title="Time left on your hold"
                    >
                      ⏳ {formatCountdown(msLeft)}
                    </span>
                    <button
                      type="button"
                      onClick={() => releaseHold(h)}
                      disabled={busySeat !== null || confirming}
                      className="text-white/40 hover:text-white text-sm"
                      aria-label={`Release seat ${h.label}`}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-6 space-y-4 text-white/70">
            <div className="flex justify-between">
              <span>Ticket</span>
              <span>{event.price}</span>
            </div>
            <div className="border-t border-white/10 pt-4 flex justify-between text-xl font-bold text-white">
              <span>Total</span>
              <span className="gradient-text">${total.toFixed(2)}</span>
            </div>
          </div>
          <button
            onClick={confirmHolds}
            disabled={liveHolds.length === 0 || confirming || isPast}
            className="mt-8 w-full py-4 rounded-2xl bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f97316] font-bold text-lg hover:scale-[1.02] hover:shadow-2xl hover:shadow-pink-500/40 transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100"
          >
            {confirming
              ? 'Booking…'
              : liveHolds.length > 1
              ? `Confirm ${liveHolds.length} seats 🎟️`
              : 'Confirm booking 🎟️'}
          </button>
          {!user && (
            <p className="mt-4 text-center text-sm text-white/50">
              <Link to="/login" className="text-[#a855f7] hover:underline">
                Log in
              </Link>{' '}
              to hold seats
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
