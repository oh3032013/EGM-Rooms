import type { VoiceSignalPayload } from './multiplayer';

export type VoiceErrorCode = 'UNSUPPORTED' | 'PERMISSION_DENIED' | 'UNKNOWN';

export interface VoiceManagerCallbacks {
  onSendSignal: (targetId: string, signal: VoiceSignalPayload) => void;
  onStateChange: (state: {
    enabled: boolean;
    muted: boolean;
    speaking: boolean;
    deafened: boolean;
    hasMic: boolean;
  }) => void;
  onNotice?: (code: 'LISTEN_ONLY' | VoiceErrorCode) => void;
}

interface PeerConnectionEntry {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  pendingIce: RTCIceCandidateInit[];
  makingOffer: boolean;
  polite: boolean;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class VoiceChatManager {
  private callbacks: VoiceManagerCallbacks;
  private myId = '';
  private enabled = false;
  private muted = false;
  private speaking = false;
  private deafened = false;
  private hasMic = false;
  private localStream: MediaStream | null = null;
  private peers = new Map<string, PeerConnectionEntry>();
  private locallyMutedPeers = new Set<string>();
  private activePeerIds = new Set<string>();
  private audioCtx: AudioContext | null = null;
  private vadIntervalId: number | null = null;
  private lastAboveThresholdAt = 0;

  constructor(callbacks: VoiceManagerCallbacks) {
    this.callbacks = callbacks;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public isDeafened(): boolean {
    return this.deafened;
  }

  public isPeerLocallyMuted(peerId: string): boolean {
    return this.locallyMutedPeers.has(peerId);
  }

  public async join(myId: string, activeVoicePeerIds: string[]): Promise<boolean> {
    if (
      typeof window === 'undefined' ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      this.callbacks.onNotice?.('UNSUPPORTED');
      return false;
    }

    this.myId = myId;
    this.stopLocalCapture();

    let stream: MediaStream | null = null;
    let listenOnly = false;

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch (err) {
        const errName = err instanceof DOMException ? err.name : '';
        if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          listenOnly = true;
        } else if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError' ||
          errName === 'SecurityError'
        ) {
          this.callbacks.onNotice?.('PERMISSION_DENIED');
          return false;
        } else {
          this.callbacks.onNotice?.('UNKNOWN');
          return false;
        }
      }
    } else {
      this.callbacks.onNotice?.('UNSUPPORTED');
      return false;
    }

    this.localStream = stream;
    this.hasMic = Boolean(stream && stream.getAudioTracks().length > 0);
    this.enabled = true;
    this.muted = !this.hasMic;
    this.speaking = false;

    if (this.hasMic) {
      this.startVad();
    } else if (listenOnly) {
      this.callbacks.onNotice?.('LISTEN_ONLY');
    }

    this.emitState();
    this.syncPeers(activeVoicePeerIds);
    return true;
  }

  public leave(clearPeerMutes = true): void {
    const wasEnabled = this.enabled;
    this.enabled = false;
    this.muted = false;
    this.speaking = false;
    this.deafened = false;
    this.hasMic = false;
    this.activePeerIds.clear();
    if (clearPeerMutes) {
      this.locallyMutedPeers.clear();
    }
    this.closeAllPeers();
    this.stopLocalCapture();
    if (wasEnabled) {
      this.emitState();
    }
  }

  public async toggleMute(): Promise<void> {
    if (!this.enabled) return;
    if (!this.hasMic) {
      const prevPeers = Array.from(this.activePeerIds);
      const prevDeafened = this.deafened;
      const ok = await this.join(this.myId, prevPeers);
      if (ok) {
        this.deafened = prevDeafened;
        this.applyAudioMuteState();
        this.emitState();
      }
      return;
    }

    this.muted = !this.muted;
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !this.muted;
      }
    }
    if (this.muted && this.speaking) {
      this.speaking = false;
    }
    this.emitState();
  }

  public toggleDeafen(): void {
    if (!this.enabled) return;
    this.deafened = !this.deafened;
    this.applyAudioMuteState();
    this.emitState();
  }

  public togglePeerMute(peerId: string): boolean {
    if (this.locallyMutedPeers.has(peerId)) {
      this.locallyMutedPeers.delete(peerId);
    } else {
      this.locallyMutedPeers.add(peerId);
    }
    this.applyAudioMuteState();
    return this.locallyMutedPeers.has(peerId);
  }

  public syncPeers(activeVoicePeerIds: string[]): void {
    if (!this.enabled) return;
    const nextSet = new Set(activeVoicePeerIds.filter((id) => id && id !== this.myId));
    this.activePeerIds = nextSet;

    // Close peers who left voice or room
    for (const [peerId] of this.peers.entries()) {
      if (!nextSet.has(peerId)) {
        this.closePeer(peerId);
      }
    }

    // Open connections for new voice peers; deterministic initiator avoids offer glare
    for (const peerId of nextSet) {
      if (!this.peers.has(peerId)) {
        const entry = this.createPeerEntry(peerId);
        if (this.myId < peerId) {
          void this.initiateOffer(peerId, entry);
        }
      }
    }
  }

  public async handleSignal(fromId: string, signal: VoiceSignalPayload): Promise<void> {
    if (!this.enabled || !fromId || fromId === this.myId) return;
    this.activePeerIds.add(fromId);
    const entry = this.peers.get(fromId) ?? this.createPeerEntry(fromId);
    const pc = entry.pc;

    try {
      if (signal.kind === 'ice') {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(signal.candidate);
        } else {
          entry.pendingIce.push(signal.candidate);
        }
        return;
      }

      if (signal.kind === 'offer') {
        const offerCollision = entry.makingOffer || pc.signalingState !== 'stable';
        if (offerCollision && !entry.polite) {
          return;
        }
        await pc.setRemoteDescription(signal.sdp);
        await this.flushPendingIce(entry);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (pc.localDescription) {
          this.callbacks.onSendSignal(fromId, {
            kind: 'answer',
            sdp: {
              type: pc.localDescription.type,
              sdp: pc.localDescription.sdp,
            },
          });
        }
        return;
      }

      if (signal.kind === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(signal.sdp);
          await this.flushPendingIce(entry);
        }
      }
    } catch {
      // Ignore transient WebRTC negotiation races
    }
  }

  private emitState(): void {
    this.callbacks.onStateChange({
      enabled: this.enabled,
      muted: this.muted,
      speaking: this.enabled && !this.muted && this.speaking,
      deafened: this.deafened,
      hasMic: this.hasMic,
    });
  }

  private createPeerEntry(peerId: string): PeerConnectionEntry {
    const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.setAttribute('playsinline', 'true');
    audioEl.muted = this.deafened || this.locallyMutedPeers.has(peerId);
    audioEl.style.display = 'none';
    document.body?.appendChild(audioEl);

    const entry: PeerConnectionEntry = {
      pc,
      audioEl,
      pendingIce: [],
      makingOffer: false,
      polite: this.myId > peerId,
    };

    if (this.localStream && this.localStream.getAudioTracks().length > 0) {
      for (const track of this.localStream.getAudioTracks()) {
        pc.addTrack(track, this.localStream);
      }
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        const json = ev.candidate.toJSON();
        this.callbacks.onSendSignal(peerId, {
          kind: 'ice',
          candidate: {
            candidate: json.candidate,
            sdpMid: json.sdpMid,
            sdpMLineIndex: json.sdpMLineIndex,
            usernameFragment: json.usernameFragment,
          },
        });
      }
    };

    pc.ontrack = (ev) => {
      const remoteStream = ev.streams[0] ?? new MediaStream([ev.track]);
      if (audioEl.srcObject !== remoteStream) {
        audioEl.srcObject = remoteStream;
      }
      audioEl.muted = this.deafened || this.locallyMutedPeers.has(peerId);
      void audioEl.play().catch(() => {
        // Autoplay fallback: user interaction already triggered join
      });
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' && this.myId < peerId) {
        pc.restartIce();
      }
    };

    this.peers.set(peerId, entry);
    return entry;
  }

  private async initiateOffer(peerId: string, entry: PeerConnectionEntry): Promise<void> {
    const { pc } = entry;
    try {
      entry.makingOffer = true;
      const offer = await pc.createOffer();
      if (pc.signalingState !== 'stable') return;
      await pc.setLocalDescription(offer);
      if (pc.localDescription) {
        this.callbacks.onSendSignal(peerId, {
          kind: 'offer',
          sdp: {
            type: pc.localDescription.type,
            sdp: pc.localDescription.sdp,
          },
        });
      }
    } catch {
      // Ignore transient signaling errors
    } finally {
      entry.makingOffer = false;
    }
  }

  private async flushPendingIce(entry: PeerConnectionEntry): Promise<void> {
    while (entry.pendingIce.length > 0) {
      const cand = entry.pendingIce.shift();
      if (!cand) continue;
      try {
        await entry.pc.addIceCandidate(cand);
      } catch {
        // Ignore stale candidates
      }
    }
  }

  private applyAudioMuteState(): void {
    for (const [peerId, entry] of this.peers.entries()) {
      entry.audioEl.muted = this.deafened || this.locallyMutedPeers.has(peerId);
    }
  }

  private closePeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    this.peers.delete(peerId);
    try {
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.oniceconnectionstatechange = null;
      entry.pc.close();
    } catch {
      // Ignore
    }
    try {
      entry.audioEl.srcObject = null;
      entry.audioEl.remove();
    } catch {
      // Ignore
    }
  }

  private closeAllPeers(): void {
    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId);
    }
  }

  private startVad(): void {
    if (!this.localStream) return;
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.audioCtx = ctx;
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
      const source = ctx.createMediaStreamSource(this.localStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      this.vadIntervalId = window.setInterval(() => {
        if (!this.enabled || this.muted || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
          if (this.speaking) {
            this.speaking = false;
            this.emitState();
          }
          return;
        }
        analyser.getByteTimeDomainData(data);
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
          const centered = (data[i] - 128) / 128;
          sumSq += centered * centered;
        }
        const rms = Math.sqrt(sumSq / data.length);
        const now = performance.now();
        if (rms > 0.025) {
          this.lastAboveThresholdAt = now;
          if (!this.speaking) {
            this.speaking = true;
            this.emitState();
          }
        } else if (this.speaking && now - this.lastAboveThresholdAt > 350) {
          this.speaking = false;
          this.emitState();
        }
      }, 110);
    } catch {
      // Voice audio still works cleanly even if VAD AudioContext fails
    }
  }

  private stopLocalCapture(): void {
    if (this.vadIntervalId !== null) {
      window.clearInterval(this.vadIntervalId);
      this.vadIntervalId = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
  }
}
