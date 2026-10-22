import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { getUser } from '../session';

interface Booking {
  id: number;
  status: 'CONFIRMED' | 'CANCELLED';
  createdAt: string;
  seat: string;
  event: { id: number; title: string; venue: string; startsAt: string; price: string; priceCents: number };
}

export default function MyBookingsPage() {
  const user = getUser();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadBookings = () => {
    api<Booking[]>('/bookings/mine')
      .then((data) => {
        setBookings(data);
        setError('');
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user?.role === 'ATTENDEE') loadBookings();
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const cancelBooking = async (id: number) => {
    if (!window.confirm('Are you sure you want to cancel? 😢')) return;

    setCancelling(id);
    try {
      await api(`/bookings/${id}/cancel`, { method: 'POST' });
      showToast('success', 'Booking cancelled ✅');
    } catch (err) {
      showToast('error', errorMessage(err));
    }
    setCancelling(null);
    loadBookings();
  };

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== 'ATTENDEE') {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-16 h-16 border-4 border-[#f97316] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-6 text-white/60 animate-pulse">Loading your bookings... 🎟️</p>
      </div>
    );
  }

  const now = new Date();
  const confirmed = bookings.filter((b) => b.status === 'CONFIRMED');
  const upcoming = confirmed.filter((b) => new Date(b.event.startsAt) > now).length;
  const totalSpent = confirmed.reduce((sum, b) => sum + b.event.priceCents, 0) / 100;

  return (
    <div>
      {toast && (
        <div
          className={`fixed top-24 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl font-medium ${
            toast.type === 'success'
              ? 'bg-gradient-to-r from-[#22c55e] to-[#16a34a]'
              : 'bg-gradient-to-r from-[#ef4444] to-[#dc2626]'
          }`}
        >
          {toast.message}
        </div>
      )}

      <h1 className="text-5xl font-extrabold mb-2">
        My <span className="gradient-text">Bookings</span> 🎟️
      </h1>
      <p className="text-white/50 mb-10">All your amazing experiences in one place ✨</p>

      {error && (
        <div className="mb-8 p-4 rounded-2xl bg-[#ef4444]/20 border border-[#ef4444]/40 text-[#fca5a5]">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-6 mb-10">
        <div className="glass rounded-2xl p-6">
          <div className="text-white/50 text-sm">Active Bookings</div>
          <div className="text-4xl font-bold gradient-text">{confirmed.length}</div>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="text-white/50 text-sm">Upcoming</div>
          <div className="text-4xl font-bold gradient-text">{upcoming}</div>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="text-white/50 text-sm">Total Spent</div>
          <div className="text-4xl font-bold gradient-text">${totalSpent.toFixed(2)}</div>
        </div>
      </div>

      {bookings.length === 0 && !error && (
        <div className="text-center py-20 text-white/40">
          <div className="text-6xl">🎭</div>
          <p className="mt-4">No bookings yet!</p>
          <Link to="/" className="text-[#a855f7]">
            Explore events →
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {bookings.map((b) => {
          const isPast = new Date(b.event.startsAt) <= now;
          const isCancelled = b.status === 'CANCELLED';
          return (
            <div
              key={b.id}
              className={`glass rounded-2xl p-6 flex items-center justify-between min-w-[760px] ${
                isCancelled ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#a855f7] via-[#ec4899] to-[#f97316] flex items-center justify-center text-2xl">
                  🎭
                </div>
                <div>
                  <Link to={`/events/${b.event.id}`} className="font-bold text-lg hover:underline">
                    {b.event.title}
                  </Link>
                  <div className="text-white/50 text-sm">
                    📍 {b.event.venue} · 📅 {new Date(b.event.startsAt).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <span className="px-3 py-1 rounded-full bg-[#a855f7]/20 text-[#d8b4fe] text-sm">💺 {b.seat}</span>
                <span className="font-bold">{b.event.price}</span>
                {isCancelled ? (
                  <span className="px-3 py-1 rounded-full bg-white/10 text-white/60 text-sm">Cancelled</span>
                ) : isPast ? (
                  <span className="px-3 py-1 rounded-full bg-white/10 text-white/60 text-sm">Past</span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-[#22c55e]/20 text-[#86efac] text-sm">✓ Confirmed</span>
                )}
                {!isCancelled && !isPast && (
                  <button
                    onClick={() => cancelBooking(b.id)}
                    disabled={cancelling === b.id}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#ef4444] to-[#dc2626] text-sm font-semibold hover:scale-105 transition-all duration-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
