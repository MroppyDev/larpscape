// Publish pipeline: review pending content changes, validate, then build +
// in-game countdown broadcast + game service restart, with live log output.
import { useEffect, useRef, useState } from 'react';
import { api, content } from '../api';

interface Commit { hash: string; at: number; message: string; }
interface Status { dirty: string[]; commits: Commit[]; unpublished: number | null; }

export default function Publish() {
  const [status, setStatus] = useState<Status | null>(null);
  const [diffStat, setDiffStat] = useState('');
  const [validation, setValidation] = useState<{ ok: boolean; errors: string[] } | null>(null);
  const [warnSeconds, setWarnSeconds] = useState(30);
  const [message, setMessage] = useState('');
  const [job, setJob] = useState<{ running: boolean; ok: boolean | null; log: string[] } | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    try {
      const [s, d] = await Promise.all([content.status(), content.diff()]);
      setStatus(s);
      setDiffStat(d.stat || '');
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const pollJob = async () => {
    try {
      const j = await api.get('/admin-api/publish/status');
      setJob(j);
      if (!j.running && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        void refresh();
      }
    } catch { /* keep polling */ }
  };

  useEffect(() => {
    void refresh();
    void pollJob();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [job?.log.length]);

  const validate = async () => {
    setValidation(null);
    const r = await content.validate();
    setValidation(r);
  };

  const publish = async () => {
    if (!confirm(`Publish now? Players get a ${warnSeconds}s in-game warning, then the server restarts.`)) return;
    try {
      await api.post('/admin-api/publish', { warnSeconds, message: message.trim() || undefined });
      setJob({ running: true, ok: null, log: [] });
      if (!pollRef.current) pollRef.current = setInterval(pollJob, 1500);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div>
      <h1>Publish</h1>
      {error && <div className="card error-text">{error}</div>}

      <div className="cards-row" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="stat-value">{status?.unpublished ?? '—'}</div>
          <div className="stat-label">unpublished commits</div>
        </div>
        <div className="card">
          <div className="stat-value">{status?.dirty.length ?? '—'}</div>
          <div className="stat-label">uncommitted files</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Pending content changes (vs live)</h2>
        {diffStat ? <div className="log" style={{ maxHeight: 220 }}>{diffStat}</div>
          : <div className="dim">No content differences against the published branch.</div>}
        {status && status.commits.length > 0 && (
          <>
            <h2>Recent content commits</h2>
            <table className="data">
              <thead><tr><th>Commit</th><th>When</th><th>Message</th></tr></thead>
              <tbody>
                {status.commits.slice(0, 10).map((c) => (
                  <tr key={c.hash}>
                    <td className="mono">{c.hash}</td>
                    <td className="dim">{new Date(c.at).toLocaleString()}</td>
                    <td>{c.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Validation</h2>
        <button onClick={validate}>Run content validation</button>
        {validation && (
          validation.ok
            ? <div className="ok-text" style={{ marginTop: 8 }}>All content valid.</div>
            : <div className="log" style={{ marginTop: 8 }}>{validation.errors.join('\n')}</div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Ship it</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <div>
            <label>In-game warning (seconds)</label>
            <input type="number" min={0} max={600} value={warnSeconds} style={{ width: 110 }}
              onChange={(e) => setWarnSeconds(Math.max(0, Math.min(600, Number(e.target.value))))} />
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label>Broadcast message (optional)</label>
            <input style={{ width: '100%' }} placeholder={`Server update in ${warnSeconds}s — you will be reconnected automatically.`}
              value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>
        <button className="primary" disabled={job?.running ?? false} onClick={publish}>
          {job?.running ? 'Publishing…' : 'Validate · Build · Broadcast · Restart'}
        </button>
        {job && (job.running || job.log.length > 0) && (
          <>
            <div style={{ marginTop: 12, marginBottom: 6 }}>
              {job.running
                ? <span className="tag warn">running</span>
                : job.ok
                  ? <span className="tag good">success</span>
                  : <span className="tag bad">failed</span>}
            </div>
            <div className="log" ref={logRef}>{job.log.join('\n') || 'Starting…'}</div>
          </>
        )}
      </div>
    </div>
  );
}
