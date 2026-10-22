import { useState, FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { getUser } from '../session';

export default function CreateEventPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(8);
  const [price, setPrice] = useState('0');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!startsAt) {
      setError('Pick a date and time');
      return;
    }
    const priceCents = Math.round(parseFloat(price || '0') * 100);
    if (Number.isNaN(priceCents) || priceCents < 0) {
      setError('Enter a valid price');
      return;
    }

    setSubmitting(true);
    try {
      const event = await api<{ id: number }>('/events', {
        method: 'POST',
        body: {
          title,
          description,
          venue,
          startsAt: new Date(startsAt).toISOString(),
          rows: Number(rows),
          cols: Number(cols),
          priceCents,
        },
      });
      navigate(`/events/${event.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  if (getUser()?.role !== 'ORGANIZER') {
    return <Navigate to="/login" replace />;
  }

  // the preview is capped like the server (26 x 30) so a typo can't freeze the page
  const previewRows = [];
  for (let r = 0; r < Math.min(Number(rows), 26); r++) {
    const seats = [];
    for (let c = 0; c < Math.min(Number(cols), 30); c++) {
      seats.push(String.fromCharCode(65 + r) + (c + 1));
    }
    previewRows.push(seats);
  }

  return (
    <div>
      <h1 className="text-5xl font-extrabold mb-2">
        Create <span className="gradient-text">Event</span> ✨
      </h1>
      <p className="text-white/50 mb-10">Bring people together for something amazing 🎉</p>

      <div className="grid grid-cols-2 gap-8">
        <form onSubmit={handleSubmit} className="glass rounded-3xl p-8 space-y-4">
          <input
            placeholder="🎭 Event title"
            aria-label="Event title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all duration-300"
          />
          <textarea
            placeholder="📝 Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all duration-300"
          />
          <input
            placeholder="📍 Venue"
            aria-label="Venue"
            required
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all duration-300"
          />
          <input
            type="datetime-local"
            aria-label="Starts at"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all duration-300"
          />
          <div className="grid grid-cols-3 gap-4">
            <label className="block text-xs text-white/50">
              Rows (max 26)
              <input
                type="number"
                min={1}
                max={26}
                required
                value={rows}
                onChange={(e) => setRows(Number(e.target.value))}
                className="mt-1 w-full text-base px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all duration-300"
              />
            </label>
            <label className="block text-xs text-white/50">
              Seats per row (max 30)
              <input
                type="number"
                min={1}
                max={30}
                required
                value={cols}
                onChange={(e) => setCols(Number(e.target.value))}
                className="mt-1 w-full text-base px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all duration-300"
              />
            </label>
            <label className="block text-xs text-white/50">
              Ticket price ($)
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="💰 Price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 w-full text-base px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all duration-300"
              />
            </label>
          </div>
          {error && <p className="text-[#fca5a5] text-sm">⚠️ {error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f97316] font-bold text-lg hover:scale-[1.02] hover:shadow-2xl hover:shadow-pink-500/40 transition-all duration-300 disabled:opacity-50"
          >
            Launch Event 🚀
          </button>
        </form>

        <div className="glass rounded-3xl p-8">
          <h3 className="text-xl font-bold mb-6">Live Preview 👀</h3>
          <div className="space-y-3">
            {previewRows.map((row, i) => (
              <div key={i} className="flex gap-3 justify-center">
                {row.map((label) => (
                  <div
                    key={label}
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xs font-bold bg-gradient-to-br from-[#a855f7]/60 to-[#6366f1]/60"
                  >
                    {label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
