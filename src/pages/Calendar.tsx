import { useEffect, useMemo, useState } from 'react';
import Nav from '../components/Nav';
import { fetchCalendar } from '../api';
import type { CalendarEvent, CalendarPayload } from '../types';

const IMPACTS = ['', 'High', 'Medium', 'Low', 'Holiday'];
const COUNTRIES_DEFAULT = ['', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY'];

export default function Calendar() {
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [country, setCountry] = useState('');
  const [impact, setImpact] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchCalendar({ country: country || undefined, impact: impact || undefined })
      .then(p => { if (live) setData(p); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [country, impact]);

  // Group events by scheduled_date
  const grouped = useMemo(() => {
    const out: Record<string, CalendarEvent[]> = {};
    for (const e of data?.events ?? []) {
      if (!out[e.scheduled_date]) out[e.scheduled_date] = [];
      out[e.scheduled_date].push(e);
    }
    return out;
  }, [data]);

  const dates = Object.keys(grouped).sort();

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      <Nav updatedAt={data?.updatedAt} />
      <main className="page">
        <div className="markets">
          <div className="group">
            <div className="sentiment-head">
              <h2>Economic Calendar — this week</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={country} onChange={e => setCountry(e.target.value)} className="cal-select">
                  {COUNTRIES_DEFAULT.map(c => <option key={c} value={c}>{c || 'All countries'}</option>)}
                </select>
                <select value={impact} onChange={e => setImpact(e.target.value)} className="cal-select">
                  {IMPACTS.map(i => <option key={i} value={i}>{i || 'All impacts'}</option>)}
                </select>
              </div>
            </div>
            {loading && !data && <div className="empty-state">Loading…</div>}
            {!loading && (!data || data.events.length === 0) && (
              <div className="empty-state">
                No events. Worker fetches Forex Factory weekly XML hourly — give it a minute or
                run the worker once.
              </div>
            )}
            {dates.map(date => (
              <div key={date} className="cal-day">
                <div className="cal-day-head">{fmtDate(date)}</div>
                <div className="cal-rows">
                  {grouped[date].map(e => (
                    <a
                      key={e.id}
                      href={e.url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`cal-row imp-${(e.impact ?? 'low').toLowerCase()}`}
                    >
                      <div className="cal-time">{e.time_label || '—'}</div>
                      <div className={`cal-impact imp-pill imp-${(e.impact ?? 'low').toLowerCase()}`}>
                        {e.impact || '—'}
                      </div>
                      <div className="cal-country">{e.country}</div>
                      <div className="cal-title">{e.title}</div>
                      <div className="cal-num"><span className="cal-lbl">F:</span> {e.forecast || '—'}</div>
                      <div className="cal-num"><span className="cal-lbl">P:</span> {e.previous || '—'}</div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
