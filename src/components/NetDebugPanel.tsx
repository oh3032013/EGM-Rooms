import { useEffect, useState } from 'react';
import { Activity, RefreshCw, Terminal, Trash2, Wifi, WifiOff, X } from 'lucide-react';
import { formatSparkline, netDebug, type NetDebugSnapshot } from '../game/netDebug';

interface NetDebugPanelProps {
  onClose: () => void;
  onPingNow: () => Promise<void>;
  onProbeHttp: () => Promise<void>;
}

function getLatencyColor(rttMs: number | null, ok: boolean): string {
  if (!ok || rttMs === null) return '#ef4444';
  if (rttMs < 80) return '#34d399';
  if (rttMs < 200) return '#fbbf24';
  return '#f87171';
}

export function NetDebugPanel({ onClose, onPingNow, onProbeHttp }: NetDebugPanelProps) {
  const [snap, setSnap] = useState<NetDebugSnapshot>(() => netDebug.getSnapshot());
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    setSnap(netDebug.getSnapshot());
    const unsub = netDebug.subscribe(() => {
      setSnap(netDebug.getSnapshot());
    });
    const refreshId = window.setInterval(() => {
      setSnap(netDebug.getSnapshot());
    }, 500);
    return () => {
      unsub();
      window.clearInterval(refreshId);
    };
  }, []);

  const validMax = Math.max(
    120,
    ...snap.samples.map((s) => s.rttMs ?? 0)
  );

  const stateBadgeClass =
    snap.readyState === 'OPEN'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : snap.readyState === 'CONNECTING'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      : 'bg-rose-500/20 text-rose-300 border-rose-500/40';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4"
      dir="ltr"
      role="dialog"
      aria-label="WebSocket Network Diagnostics"
    >
      <div className="safe-area-modal flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-emerald-700/60 bg-slate-950/95 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {snap.readyState === 'OPEN' ? (
              <Wifi className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <WifiOff className="h-4 w-4 shrink-0 text-rose-400" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold tracking-wide text-amber-200">
                  WebSocket Sync Diagnostics
                </h2>
                <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${stateBadgeClass}`}>
                  {snap.readyState}
                </span>
              </div>
              <p className="truncate font-mono text-[11px] text-slate-400">
                {snap.wsUrl || 'Localhost / Default'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close network diagnostics"
            className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {snap.wsPingSupported === false && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/50 px-3 py-2 text-xs text-amber-200">
              Remote server did not reply to <code className="font-mono text-amber-100">net:ping</code> yet (it may still run an older deployment).
              Showing real HTTP <code className="font-mono text-amber-100">/api/health</code> RTT + <code className="font-mono text-amber-100">tick:entities</code> cadence instead.
            </div>
          )}

          {/* Primary KPI Cards */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="text-[11px] font-medium text-slate-400">Latency (RTT)</div>
              <div className="mt-0.5 font-mono text-lg font-bold text-emerald-300">
                {snap.latestRttMs !== null ? `${snap.latestRttMs} ms` : '--'}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                min {snap.minRttMs ?? '--'} / avg {snap.avgRttMs ?? '--'} / p95 {snap.p95RttMs ?? '--'}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="text-[11px] font-medium text-slate-400">Packet Loss</div>
              <div
                className={`mt-0.5 font-mono text-lg font-bold ${
                  snap.packetLossPct > 2 ? 'text-rose-400' : 'text-emerald-300'
                }`}
              >
                {snap.packetLossPct.toFixed(1)}%
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                lost {snap.lostPings} / {snap.receivedPongs + snap.lostPings} (inflight {snap.inFlightPings})
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="text-[11px] font-medium text-slate-400">Jitter</div>
              <div className="mt-0.5 font-mono text-lg font-bold text-sky-300">
                {snap.latestJitterMs !== null ? `${snap.latestJitterMs} ms` : '--'}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                avg {snap.avgJitterMs ?? '--'} ms • skew {snap.lastClockSkewMs !== null ? `${snap.lastClockSkewMs}ms` : '--'}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="text-[11px] font-medium text-slate-400">Entity Tick Sync</div>
              <div className="mt-0.5 font-mono text-lg font-bold text-amber-300">
                {snap.avgTickIntervalMs !== null ? `${snap.avgTickIntervalMs} ms` : '--'}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                max {snap.maxTickIntervalMs ?? '--'}ms • stalls {snap.tickStalls} • drops {snap.tickSeqGaps}
              </div>
            </div>
          </div>

          {/* RTT Bar Chart */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
                Recent Probes (last {snap.samples.length}/40) — Mode: {snap.probeMode}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                {formatSparkline(snap.samples)}
              </span>
            </div>

            {snap.samples.length === 0 ? (
              <div className="flex h-24 items-center justify-center rounded border border-dashed border-slate-800 text-xs text-slate-400">
                Join a room or click &ldquo;Probe HTTP&rdquo; to collect real RTT samples.
              </div>
            ) : (
              <svg
                viewBox="0 0 400 90"
                className="h-24 w-full overflow-visible rounded border border-slate-800/80 bg-slate-950/60 p-1"
                preserveAspectRatio="none"
              >
                {snap.samples.map((s, idx) => {
                  const slotW = 400 / 40;
                  const x = idx * slotW + 1.5;
                  const barW = Math.max(4, slotW - 3);
                  const h =
                    !s.ok || s.rttMs === null
                      ? 84
                      : Math.max(6, Math.round((s.rttMs / validMax) * 82));
                  const y = 86 - h;
                  const fill = getLatencyColor(s.rttMs, s.ok);
                  return (
                    <g key={`${s.seq}-${idx}`}>
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={h}
                        rx={1.5}
                        fill={fill}
                        opacity={s.ok ? 0.9 : 0.75}
                      >
                        <title>
                          {s.ok
                            ? `#${s.seq} (${s.source.toUpperCase()}): ${s.rttMs} ms`
                            : `#${s.seq} (${s.source.toUpperCase()}): DROPPED / TIMEOUT`}
                        </title>
                      </rect>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* Transport + Traffic Details */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-xs">
              <div className="mb-1.5 font-semibold text-slate-200">Socket &amp; Railway HTTP</div>
              <div className="space-y-1 font-mono text-[11px] text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">WS Buffered:</span>
                  <span>{snap.bufferedAmount} B</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Connects / Reconnects:</span>
                  <span>
                    {snap.connectCount} / {snap.reconnectCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Last Close:</span>
                  <span>
                    {snap.lastCloseCode !== null
                      ? `${snap.lastCloseCode} ${snap.lastCloseReason ?? ''}`.trim()
                      : '--'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">HTTP /api/health:</span>
                  <span
                    className={
                      snap.httpOk === true
                        ? 'text-emerald-300'
                        : snap.httpOk === false
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }
                  >
                    {snap.httpLastRttMs !== null
                      ? `${snap.httpLastRttMs} ms (${snap.httpStatus ?? snap.httpError ?? 'err'})`
                      : 'Not probed'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-xs">
              <div className="mb-1.5 font-semibold text-slate-200">Message Traffic (TX / RX)</div>
              <div className="space-y-1 font-mono text-[11px] text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Sent (TX):</span>
                  <span>
                    {snap.txMessages} msgs ({(snap.txBytes / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Recv (RX):</span>
                  <span>
                    {snap.rxMessages} msgs ({(snap.rxBytes / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Move TX / Tick RX:</span>
                  <span>
                    {snap.txByType['player:move'] ?? 0} / {snap.rxByType['tick:entities'] ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">World Syncs / FX:</span>
                  <span>
                    {snap.rxByType['world:sync'] ?? 0} / {snap.rxByType['fx:event'] ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-900/90 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={probing}
              onClick={() => {
                setProbing(true);
                void onPingNow().finally(() => setProbing(false));
              }}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-600/60 bg-emerald-700/80 px-3 py-1.5 font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${probing ? 'animate-spin' : ''}`} />
              Ping Now
            </button>
            <button
              type="button"
              disabled={probing}
              onClick={() => {
                setProbing(true);
                void onProbeHttp().finally(() => setProbing(false));
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              Probe HTTP
            </button>
            <button
              type="button"
              onClick={() => netDebug.report()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-700"
            >
              <Terminal className="h-3.5 w-3.5" />
              Log Console
            </button>
            <button
              type="button"
              onClick={() => netDebug.reset()}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 font-semibold text-slate-300 hover:bg-slate-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
          <span className="font-mono text-[10px] text-slate-400">
            Shortcut: F9 • Console: __ecogrowNetDebug
          </span>
        </div>
      </div>
    </div>
  );
}
