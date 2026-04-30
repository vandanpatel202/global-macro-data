import { useEffect, useState } from 'react';
import Nav from '../components/Nav';
import { fetchCronStatus } from '../api';
import type { CronStatusPayload, CronTaskStatus } from '../types';
import { timeAgo } from '../format';

const LABELS: Record<string, string> = {
  news:      'News (RSS)',
  sentiment: 'Sentiment (Reddit)',
  calendar:  'Calendar (Forex Factory)',
  ibkr:      'IBKR Backfill',
  fred:      'FRED Backfill',
  gateway:   'IB Gateway keepalive',
};

function statusOf(t: CronTaskStatus): { label: string; cls: string } {
  if (!t.lastAt) return { label: 'never run', cls: 'down' };
  const lagSec = (Date.now() - new Date(t.lastAt).getTime()) / 1000;
  if (lagSec > t.expectedSec * 3) return { label: `lagging ${Math.round(lagSec/60)}m`, cls: 'down' };
  if (lagSec > t.expectedSec * 1.5) return { label: `slow ${Math.round(lagSec/60)}m`, cls: 'warn' };
  return { label: 'healthy', cls: 'ok' };
}

export default function Health() {
  const [data, setData] = useState<CronStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchCronStatus()
      .then(p => { if (live) setData(p); })
      .finally(() => { if (live) setLoading(false); });
    const id = setInterval(() => fetchCronStatus().then(p => live && setData(p)).catch(() => 0), 30_000);
    return () => { live = false; clearInterval(id); };
  }, [reloadKey]);

  const tasks = data?.tasks ?? [];

  return (
    <>
      <Nav updatedAt={data?.generatedAt} onRefresh={() => setReloadKey(k => k + 1)} />
      <main className="page">
        <div className="markets">
          <div className="group">
            <h2>Cron tasks</h2>
            {loading && !tasks.length && <div className="empty-state">Loading…</div>}
            <div className="health-list">
              {tasks.map(t => {
                const st = statusOf(t);
                return (
                  <details key={t.name} className={`health-row st-${st.cls}`}>
                    <summary>
                      <div className={`health-pill st-${st.cls}`}>{st.label}</div>
                      <div className="health-name">{LABELS[t.name] || t.name}</div>
                      <div className="health-schedule"><code>{t.schedule}</code></div>
                      <div className="health-meta">
                        last: <strong>{t.lastAt ? timeAgo(t.lastAt) : '—'}</strong>
                        {t.recent != null && <> · recent: <strong>{t.recent}</strong></>}
                        {t.total != null && <> · total: <strong>{t.total}</strong></>}
                      </div>
                    </summary>
                    {t.logTail && t.logTail.length > 0 && (
                      <pre className="health-log">{t.logTail.join('\n')}</pre>
                    )}
                    {t.logExists === false && (
                      <div className="empty-state" style={{ padding: '8px 12px', textAlign: 'left' }}>
                        no log file at <code>{data?.logDir}/{t.name}.log</code> yet — task hasn't run.
                      </div>
                    )}
                  </details>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
