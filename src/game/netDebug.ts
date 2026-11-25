import { resolveHttpApiBase, resolveWebSocketUrl } from './multiplayer.ts';

export type NetReadyStateLabel = 'DISCONNECTED' | 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';

export interface NetPingSample {
  seq: number;
  rttMs: number | null;
  jitterMs: number | null;
  ok: boolean;
  source: 'ws' | 'http';
  at: number;
  clockSkewMs: number | null;
}

export interface NetDebugSnapshot {
  wsUrl: string;
  httpBase: string;
  readyState: NetReadyStateLabel;
  bufferedAmount: number;
  connectCount: number;
  reconnectCount: number;
  lastCloseCode: number | null;
  lastCloseReason: string | null;
  wsPingSupported: boolean | null;
  probeMode: 'idle' | 'ws-pong' | 'http-probe';
  sentPings: number;
  receivedPongs: number;
  lostPings: number;
  inFlightPings: number;
  packetLossPct: number;
  latestRttMs: number | null;
  minRttMs: number | null;
  avgRttMs: number | null;
  p95RttMs: number | null;
  maxRttMs: number | null;
  latestJitterMs: number | null;
  avgJitterMs: number | null;
  lastClockSkewMs: number | null;
  samples: NetPingSample[];
  tickIntervals: number[];
  lastTickIntervalMs: number | null;
  avgTickIntervalMs: number | null;
  maxTickIntervalMs: number | null;
  tickStalls: number;
  tickSeqGaps: number;
  lastTickSeq: number | null;
  txMessages: number;
  rxMessages: number;
  txBytes: number;
  rxBytes: number;
  txByType: Record<string, number>;
  rxByType: Record<string, number>;
  httpLastRttMs: number | null;
  httpOk: boolean | null;
  httpStatus: number | null;
  httpError: string | null;
  httpCheckedAt: number | null;
  watchingConsole: boolean;
}

const MAX_SAMPLES = 40;
const MAX_TICK_INTERVALS = 30;
const PING_TIMEOUT_MS = 3000;
const TICK_STALL_THRESHOLD_MS = 1400;
const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

export function readyStateToLabel(ws: { readyState: number } | null): NetReadyStateLabel {
  if (!ws) return 'DISCONNECTED';
  switch (ws.readyState) {
    case 0:
      return 'CONNECTING';
    case 1:
      return 'OPEN';
    case 2:
      return 'CLOSING';
    case 3:
      return 'CLOSED';
    default:
      return 'DISCONNECTED';
  }
}

export function formatSparkline(samples: readonly NetPingSample[]): string {
  if (samples.length === 0) return '(no samples yet)';
  const valid = samples.map((s) => s.rttMs).filter((v): v is number => v !== null);
  const maxRtt = Math.max(120, ...valid);
  return samples
    .map((s) => {
      if (!s.ok || s.rttMs === null) return '✕';
      const ratio = Math.min(1, Math.max(0, s.rttMs / maxRtt));
      const idx = Math.min(SPARK_CHARS.length - 1, Math.floor(ratio * SPARK_CHARS.length));
      return SPARK_CHARS[idx];
    })
    .join('');
}

interface PendingPing {
  seq: number;
  sentAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class NetDebugTracker {
  private wsUrl = '';
  private httpBase = '';
  private readyState: NetReadyStateLabel = 'DISCONNECTED';
  private bufferedAmount = 0;
  private connectCount = 0;
  private reconnectCount = 0;
  private lastCloseCode: number | null = null;
  private lastCloseReason: string | null = null;
  private wsPingSupported: boolean | null = null;
  private consecutiveMissedPings = 0;
  private nextPingSeq = 1;
  private sentPings = 0;
  private receivedPongs = 0;
  private lostPings = 0;
  private pendingPings = new Map<number, PendingPing>();
  private samples: NetPingSample[] = [];
  private lastSuccessfulWsRttMs: number | null = null;
  private lastClockSkewMs: number | null = null;

  private lastTickAt: number | null = null;
  private lastTickSeq: number | null = null;
  private tickIntervals: number[] = [];
  private maxTickIntervalMs: number | null = null;
  private tickStalls = 0;
  private tickSeqGaps = 0;

  private txMessages = 0;
  private rxMessages = 0;
  private txBytes = 0;
  private rxBytes = 0;
  private txByType: Record<string, number> = {};
  private rxByType: Record<string, number> = {};

  private httpLastRttMs: number | null = null;
  private httpOk: boolean | null = null;
  private httpStatus: number | null = null;
  private httpError: string | null = null;
  private httpCheckedAt: number | null = null;

  private listeners = new Set<() => void>();
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private uiHandler: ((visible: boolean | 'toggle') => void) | null = null;
  private manualPingHandler: (() => Promise<void>) | null = null;

  private ensureDefaultEndpoints(): void {
    if (!this.wsUrl && typeof window !== 'undefined') {
      try {
        this.wsUrl = resolveWebSocketUrl();
        this.httpBase = resolveHttpApiBase();
      } catch {
        // Ignore non-browser environments
      }
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setUiHandler(handler: ((visible: boolean | 'toggle') => void) | null): void {
    this.uiHandler = handler;
  }

  setManualPingHandler(handler: (() => Promise<void>) | null): void {
    this.manualPingHandler = handler;
  }

  setEndpoint(wsUrl: string, httpBase: string): void {
    this.wsUrl = wsUrl;
    this.httpBase = httpBase;
    this.emit();
  }

  syncSocketState(ws: { readyState: number; bufferedAmount?: number } | null): void {
    const nextState = readyStateToLabel(ws);
    const nextBuf = ws && typeof ws.bufferedAmount === 'number' ? ws.bufferedAmount : 0;
    if (nextState !== this.readyState || nextBuf !== this.bufferedAmount) {
      this.readyState = nextState;
      this.bufferedAmount = nextBuf;
      this.emit();
    }
  }

  recordConnecting(ws: { readyState: number; bufferedAmount?: number } | null, isReconnect: boolean): void {
    this.ensureDefaultEndpoints();
    if (isReconnect) {
      this.reconnectCount += 1;
    }
    this.readyState = readyStateToLabel(ws);
    this.bufferedAmount = ws && typeof ws.bufferedAmount === 'number' ? ws.bufferedAmount : 0;
    this.emit();
  }

  recordConnected(ws: { readyState: number; bufferedAmount?: number } | null): void {
    this.ensureDefaultEndpoints();
    this.connectCount += 1;
    this.lastCloseCode = null;
    this.lastCloseReason = null;
    this.readyState = readyStateToLabel(ws);
    this.bufferedAmount = ws && typeof ws.bufferedAmount === 'number' ? ws.bufferedAmount : 0;
    this.emit();
  }

  recordClosed(code?: number, reason?: string): void {
    this.clearPendingPings(false);
    this.readyState = 'CLOSED';
    this.bufferedAmount = 0;
    this.lastCloseCode = typeof code === 'number' ? code : null;
    this.lastCloseReason = reason ? String(reason) : null;
    this.emit();
  }

  recordDisconnected(): void {
    this.clearPendingPings(false);
    this.readyState = 'DISCONNECTED';
    this.bufferedAmount = 0;
    this.resetRoomSyncTracking();
    this.emit();
  }

  resetRoomSyncTracking(): void {
    this.lastTickAt = null;
    this.lastTickSeq = null;
  }

  allocatePingSeq(): number {
    const seq = this.nextPingSeq;
    this.nextPingSeq += 1;
    return seq;
  }

  recordPingSent(seq: number, sentAt = Date.now(), timeoutMs = PING_TIMEOUT_MS): void {
    this.sentPings += 1;
    const timeoutId = setTimeout(() => {
      const entry = this.pendingPings.get(seq);
      if (!entry) return;
      this.pendingPings.delete(seq);
      this.lostPings += 1;
      this.consecutiveMissedPings += 1;
      if (this.receivedPongs === 0 && this.consecutiveMissedPings >= 2) {
        this.wsPingSupported = false;
      }
      this.pushSample({
        seq,
        rttMs: null,
        jitterMs: null,
        ok: false,
        source: 'ws',
        at: Date.now(),
        clockSkewMs: null,
      });
      this.emit();
    }, timeoutMs);
    this.pendingPings.set(seq, { seq, sentAt, timeoutId });
    this.emit();
  }

  recordPong(seq: number, clientSentAt: number, serverTime: number, receivedAt = Date.now()): void {
    const pending = this.pendingPings.get(seq);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingPings.delete(seq);
    }
    const baseSent = pending ? pending.sentAt : clientSentAt;
    if (!Number.isFinite(baseSent)) return;
    const rttMs = Math.max(0, Math.round(receivedAt - baseSent));
    const jitterMs =
      this.lastSuccessfulWsRttMs !== null ? Math.abs(rttMs - this.lastSuccessfulWsRttMs) : 0;
    this.lastSuccessfulWsRttMs = rttMs;
    const clockSkewMs = Number.isFinite(serverTime)
      ? Math.round(serverTime - (baseSent + rttMs / 2))
      : null;
    this.lastClockSkewMs = clockSkewMs;
    this.wsPingSupported = true;
    this.consecutiveMissedPings = 0;
    this.receivedPongs += 1;
    this.pushSample({
      seq,
      rttMs,
      jitterMs,
      ok: true,
      source: 'ws',
      at: receivedAt,
      clockSkewMs,
    });
    this.emit();
  }

  recordTx(type: string, byteLength: number, bufferedAmount = 0): void {
    this.txMessages += 1;
    this.txBytes += Math.max(0, byteLength);
    this.txByType[type] = (this.txByType[type] ?? 0) + 1;
    this.bufferedAmount = Math.max(0, bufferedAmount);
  }

  recordRx(type: string, byteLength: number, bufferedAmount = 0): void {
    this.rxMessages += 1;
    this.rxBytes += Math.max(0, byteLength);
    this.rxByType[type] = (this.rxByType[type] ?? 0) + 1;
    this.bufferedAmount = Math.max(0, bufferedAmount);
  }

  recordTickEntities(seq?: number, now = Date.now()): void {
    if (this.lastTickAt !== null) {
      const interval = Math.max(0, Math.round(now - this.lastTickAt));
      this.tickIntervals.push(interval);
      if (this.tickIntervals.length > MAX_TICK_INTERVALS) {
        this.tickIntervals.shift();
      }
      this.maxTickIntervalMs =
        this.maxTickIntervalMs === null ? interval : Math.max(this.maxTickIntervalMs, interval);
      if (interval > TICK_STALL_THRESHOLD_MS) {
        this.tickStalls += 1;
      }
    }
    this.lastTickAt = now;

    if (typeof seq === 'number' && Number.isFinite(seq)) {
      if (this.lastTickSeq !== null && seq > this.lastTickSeq + 1) {
        this.tickSeqGaps += seq - this.lastTickSeq - 1;
      }
      this.lastTickSeq = seq;
    }
    this.emit();
  }

  async probeHttp(customServerUrl?: string): Promise<{ ok: boolean; rttMs: number | null; status: number | null }> {
    this.ensureDefaultEndpoints();
    const base =
      customServerUrl !== undefined
        ? resolveHttpApiBase(customServerUrl)
        : this.httpBase || resolveHttpApiBase();
    const wsUrl =
      customServerUrl !== undefined
        ? resolveWebSocketUrl(customServerUrl)
        : this.wsUrl || resolveWebSocketUrl();
    this.httpBase = base;
    this.wsUrl = wsUrl;

    const url = `${base}/api/health`;
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

    try {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: controller?.signal,
      });
      const elapsed = Math.max(
        0,
        Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start)
      );
      this.httpLastRttMs = elapsed;
      this.httpOk = res.ok;
      this.httpStatus = res.status;
      this.httpError = res.ok ? null : `HTTP ${res.status}`;
      this.httpCheckedAt = Date.now();
      if (this.wsPingSupported !== true) {
        this.pushSample({
          seq: this.allocatePingSeq(),
          rttMs: res.ok ? elapsed : null,
          jitterMs: null,
          ok: res.ok,
          source: 'http',
          at: Date.now(),
          clockSkewMs: null,
        });
      }
      this.emit();
      return { ok: res.ok, rttMs: elapsed, status: res.status };
    } catch (err) {
      const elapsed = Math.max(
        0,
        Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start)
      );
      this.httpLastRttMs = elapsed;
      this.httpOk = false;
      this.httpStatus = null;
      this.httpError = err instanceof Error ? err.message : 'Network error';
      this.httpCheckedAt = Date.now();
      this.emit();
      return { ok: false, rttMs: elapsed, status: null };
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  }

  private pushSample(sample: NetPingSample): void {
    this.samples.push(sample);
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }
  }

  private clearPendingPings(countAsLost: boolean): void {
    for (const pending of this.pendingPings.values()) {
      clearTimeout(pending.timeoutId);
      if (countAsLost) {
        this.lostPings += 1;
      }
    }
    this.pendingPings.clear();
  }

  reset(): void {
    this.clearPendingPings(false);
    this.wsPingSupported = null;
    this.consecutiveMissedPings = 0;
    this.sentPings = 0;
    this.receivedPongs = 0;
    this.lostPings = 0;
    this.samples = [];
    this.lastSuccessfulWsRttMs = null;
    this.lastClockSkewMs = null;
    this.lastTickAt = null;
    this.lastTickSeq = null;
    this.tickIntervals = [];
    this.maxTickIntervalMs = null;
    this.tickStalls = 0;
    this.tickSeqGaps = 0;
    this.txMessages = 0;
    this.rxMessages = 0;
    this.txBytes = 0;
    this.rxBytes = 0;
    this.txByType = {};
    this.rxByType = {};
    this.httpLastRttMs = null;
    this.httpOk = null;
    this.httpStatus = null;
    this.httpError = null;
    this.httpCheckedAt = null;
    this.emit();
  }

  getSnapshot(): NetDebugSnapshot {
    this.ensureDefaultEndpoints();
    const validRtts = this.samples
      .filter((s) => s.ok && s.rttMs !== null)
      .map((s) => s.rttMs as number);
    const sorted = [...validRtts].sort((a, b) => a - b);
    const jitters = this.samples
      .filter((s) => s.ok && s.jitterMs !== null)
      .map((s) => s.jitterMs as number);

    const completedPings = this.receivedPongs + this.lostPings;
    const packetLossPct =
      completedPings > 0 ? Math.round((this.lostPings / completedPings) * 1000) / 10 : 0;

    const latestSample = [...this.samples].reverse().find((s) => s.ok && s.rttMs !== null);
    const latestRttMs = latestSample ? latestSample.rttMs : null;
    const minRttMs = sorted.length > 0 ? sorted[0] : null;
    const maxRttMs = sorted.length > 0 ? sorted[sorted.length - 1] : null;
    const avgRttMs =
      validRtts.length > 0
        ? Math.round(validRtts.reduce((acc, v) => acc + v, 0) / validRtts.length)
        : null;
    const p95RttMs =
      sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : null;

    const latestJitterSample = [...this.samples]
      .reverse()
      .find((s) => s.ok && s.jitterMs !== null);
    const latestJitterMs = latestJitterSample ? latestJitterSample.jitterMs : null;
    const avgJitterMs =
      jitters.length > 0
        ? Math.round(jitters.reduce((acc, v) => acc + v, 0) / jitters.length)
        : null;

    const lastTickIntervalMs =
      this.tickIntervals.length > 0 ? this.tickIntervals[this.tickIntervals.length - 1] : null;
    const avgTickIntervalMs =
      this.tickIntervals.length > 0
        ? Math.round(
            this.tickIntervals.reduce((acc, v) => acc + v, 0) / this.tickIntervals.length
          )
        : null;

    const probeMode: NetDebugSnapshot['probeMode'] =
      this.wsPingSupported === true
        ? 'ws-pong'
        : this.httpCheckedAt !== null
        ? 'http-probe'
        : 'idle';

    return {
      wsUrl: this.wsUrl,
      httpBase: this.httpBase,
      readyState: this.readyState,
      bufferedAmount: this.bufferedAmount,
      connectCount: this.connectCount,
      reconnectCount: this.reconnectCount,
      lastCloseCode: this.lastCloseCode,
      lastCloseReason: this.lastCloseReason,
      wsPingSupported: this.wsPingSupported,
      probeMode,
      sentPings: this.sentPings,
      receivedPongs: this.receivedPongs,
      lostPings: this.lostPings,
      inFlightPings: this.pendingPings.size,
      packetLossPct,
      latestRttMs,
      minRttMs,
      avgRttMs,
      p95RttMs,
      maxRttMs,
      latestJitterMs,
      avgJitterMs,
      lastClockSkewMs: this.lastClockSkewMs,
      samples: [...this.samples],
      tickIntervals: [...this.tickIntervals],
      lastTickIntervalMs,
      avgTickIntervalMs,
      maxTickIntervalMs: this.maxTickIntervalMs,
      tickStalls: this.tickStalls,
      tickSeqGaps: this.tickSeqGaps,
      lastTickSeq: this.lastTickSeq,
      txMessages: this.txMessages,
      rxMessages: this.rxMessages,
      txBytes: this.txBytes,
      rxBytes: this.rxBytes,
      txByType: { ...this.txByType },
      rxByType: { ...this.rxByType },
      httpLastRttMs: this.httpLastRttMs,
      httpOk: this.httpOk,
      httpStatus: this.httpStatus,
      httpError: this.httpError,
      httpCheckedAt: this.httpCheckedAt,
      watchingConsole: this.watchTimer !== null,
    };
  }

  report(): NetDebugSnapshot {
    const snap = this.getSnapshot();
    const spark = formatSparkline(snap.samples);
    console.groupCollapsed(
      `[EcoGrow NetDebug] ${snap.readyState} | RTT ${snap.latestRttMs ?? '--'}ms (avg ${snap.avgRttMs ?? '--'}ms) | Loss ${snap.packetLossPct}% | ${spark}`
    );
    console.table({
      endpoint: { value: snap.wsUrl || '(local/unset)' },
      socketState: { value: snap.readyState },
      bufferedBytes: { value: snap.bufferedAmount },
      probeMode: { value: snap.probeMode },
      rttLatestMs: { value: snap.latestRttMs ?? '--' },
      rttAvgMs: { value: snap.avgRttMs ?? '--' },
      rttP95Ms: { value: snap.p95RttMs ?? '--' },
      jitterAvgMs: { value: snap.avgJitterMs ?? '--' },
      pingLossPct: { value: `${snap.packetLossPct}% (${snap.lostPings}/${snap.receivedPongs + snap.lostPings})` },
      tickCadenceAvgMs: { value: snap.avgTickIntervalMs ?? '--' },
      tickStalls: { value: snap.tickStalls },
      tickSeqDrops: { value: snap.tickSeqGaps },
      httpHealthRttMs: { value: snap.httpLastRttMs ?? '--' },
      txTotal: { value: `${snap.txMessages} msgs (${(snap.txBytes / 1024).toFixed(1)} KB)` },
      rxTotal: { value: `${snap.rxMessages} msgs (${(snap.rxBytes / 1024).toFixed(1)} KB)` },
    });
    console.log('Sparkline (newest right, ✕ = dropped):', spark);
    console.log('TX breakdown:', snap.txByType, '| RX breakdown:', snap.rxByType);
    console.groupEnd();
    return snap;
  }

  watch(enabled = true, intervalMs = 3000): boolean {
    if (this.watchTimer !== null) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }
    if (enabled) {
      this.report();
      this.watchTimer = setInterval(() => {
        this.report();
      }, Math.max(1000, intervalMs));
    }
    this.emit();
    return this.watchTimer !== null;
  }

  async ping(): Promise<NetDebugSnapshot> {
    if (this.manualPingHandler) {
      await this.manualPingHandler();
    } else {
      await this.probeHttp();
    }
    return this.report();
  }

  show(): void {
    this.uiHandler?.(true);
  }

  hide(): void {
    this.uiHandler?.(false);
  }

  toggle(): void {
    this.uiHandler?.('toggle');
  }
}

export const netDebug = new NetDebugTracker();

export interface EcoGrowNetDebugConsoleApi {
  help: () => void;
  report: () => NetDebugSnapshot;
  watch: (enabled?: boolean, intervalMs?: number) => boolean;
  ping: () => Promise<NetDebugSnapshot>;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  reset: () => void;
  getSnapshot: () => NetDebugSnapshot;
}

declare global {
  interface Window {
    __ecogrowNetDebug?: EcoGrowNetDebugConsoleApi;
  }
}

let consoleInitialized = false;

export function initNetDebugGlobal(): EcoGrowNetDebugConsoleApi | null {
  if (typeof window === 'undefined') return null;
  if (!window.__ecogrowNetDebug) {
    const api: EcoGrowNetDebugConsoleApi = {
      help: () => {
        console.info(
          [
            '[EcoGrow NetDebug Commands]',
            '  __ecogrowNetDebug.show()      -> Open live visual diagnostic overlay (or press F9 / ?netdebug=1)',
            '  __ecogrowNetDebug.hide()      -> Close visual overlay',
            '  __ecogrowNetDebug.report()    -> Print RTT, jitter, packet loss & tick sync summary table',
            '  __ecogrowNetDebug.watch(true) -> Stream diagnostics every 3s in console (watch(false) stops)',
            '  __ecogrowNetDebug.ping()      -> Send immediate WS net:ping + Railway /api/health probe',
            '  __ecogrowNetDebug.reset()     -> Clear collected samples & counters',
          ].join('\n')
        );
      },
      report: () => netDebug.report(),
      watch: (enabled = true, intervalMs = 3000) => netDebug.watch(enabled, intervalMs),
      ping: () => netDebug.ping(),
      show: () => netDebug.show(),
      hide: () => netDebug.hide(),
      toggle: () => netDebug.toggle(),
      reset: () => netDebug.reset(),
      getSnapshot: () => netDebug.getSnapshot(),
    };
    window.__ecogrowNetDebug = api;
  }
  if (!consoleInitialized) {
    consoleInitialized = true;
    console.info(
      '[EcoGrow] Network diagnostics ready. Run __ecogrowNetDebug.help(), __ecogrowNetDebug.show(), or press F9.'
    );
  }
  return window.__ecogrowNetDebug;
}
