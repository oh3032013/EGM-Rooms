import { useEffect, useState } from 'react';
import { Globe, Lock, Plus, RefreshCw, Server, Users, X } from 'lucide-react';
import { translateSeason, UI_TEXT, type Language } from '../game/i18n';
import {
  getSavedMultiplayerServerUrl,
  getSavedPlayerName,
  saveMultiplayerServerUrl,
  savePlayerName,
  type RoomSummary,
} from '../game/multiplayer';

interface RoomsModalProps {
  lang: Language;
  loading: boolean;
  error: string | null;
  rooms: RoomSummary[];
  initialRoomCode?: string;
  onRefreshRooms: (serverUrl?: string, silent?: boolean) => void;
  onCreateRoom: (opts: {
    playerName: string;
    roomName: string;
    isPublic: boolean;
    serverUrl?: string;
  }) => void;
  onJoinRoom: (opts: { code: string; playerName: string; serverUrl?: string }) => void;
  onClose: () => void;
}

export function RoomsModal({
  lang,
  loading,
  error,
  rooms,
  initialRoomCode = '',
  onRefreshRooms,
  onCreateRoom,
  onJoinRoom,
  onClose,
}: RoomsModalProps) {
  const t = UI_TEXT[lang];
  const [tab, setTab] = useState<'join' | 'create'>('join');
  const [playerName, setPlayerName] = useState<string>(() => {
    return getSavedPlayerName() || (lang === 'ar' ? 'مزارع' : 'Farmer');
  });
  const [roomName, setRoomName] = useState<string>('');
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [roomCode, setRoomCode] = useState<string>(() => initialRoomCode.trim().toUpperCase());
  const [showServerConfig, setShowServerConfig] = useState<boolean>(false);
  const [serverUrl, setServerUrl] = useState<string>(() => getSavedMultiplayerServerUrl());

  useEffect(() => {
    if (initialRoomCode) {
      setTab('join');
      setRoomCode(initialRoomCode.trim().toUpperCase());
    }
  }, [initialRoomCode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onRefreshRooms(serverUrl, false);
    }, 250);
    const pollId = window.setInterval(() => {
      onRefreshRooms(serverUrl, true);
    }, 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(pollId);
    };
  }, [onRefreshRooms, serverUrl]);

  const handleSaveName = (val: string) => {
    setPlayerName(val);
    savePlayerName(val);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPlayer = playerName.trim() || (lang === 'ar' ? 'مزارع' : 'Farmer');
    savePlayerName(cleanPlayer);
    saveMultiplayerServerUrl(serverUrl);
    onCreateRoom({
      playerName: cleanPlayer,
      roomName: roomName.trim() || `${cleanPlayer}'s Farm`,
      isPublic,
      serverUrl,
    });
  };

  const handleJoinCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCode.trim().toUpperCase();
    if (!cleanCode) return;
    const cleanPlayer = playerName.trim() || (lang === 'ar' ? 'مزارع' : 'Farmer');
    savePlayerName(cleanPlayer);
    saveMultiplayerServerUrl(serverUrl);
    onJoinRoom({ code: cleanCode, playerName: cleanPlayer, serverUrl });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-black/65"
      role="dialog"
      aria-modal="true"
      aria-label={t.roomsModalTitle}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="parchment-panel rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b-2 border-[#d4ba8f] bg-[#ebd8b5]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#3d7a47] border-2 border-[#63a86a] flex items-center justify-center text-white shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#2c1e14] leading-tight">
                {t.roomsModalTitle}
              </h2>
              <p className="text-xs text-[#694d36]">{t.roomsModalSub}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.cancel}
            className="wood-button p-1.5 rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Farmer Name */}
          <div>
            <label className="block text-xs font-bold text-[#4a3220] mb-1">
              {t.playerNameLabel}
            </label>
            <input
              type="text"
              maxLength={18}
              value={playerName}
              onChange={(e) => handleSaveName(e.target.value)}
              placeholder={t.playerNamePlaceholder}
              className="w-full px-3 py-2 rounded-lg bg-[#fff9ec] border-2 border-[#b89763] text-sm font-semibold text-[#2c1e14] focus:outline-none focus:border-[#3d7a47]"
            />
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="tab-join-room"
              onClick={() => setTab('join')}
              className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold cursor-pointer border-2 transition-colors ${
                tab === 'join'
                  ? 'bg-[#3d7a47] text-white border-[#244e2b]'
                  : 'bg-[#e6cfa8] text-[#4a3220] border-[#b89763] hover:bg-[#dcc091]'
              }`}
            >
              {t.joinRoomTab}
            </button>
            <button
              type="button"
              data-testid="tab-create-room"
              onClick={() => setTab('create')}
              className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold cursor-pointer border-2 transition-colors flex items-center justify-center gap-1.5 ${
                tab === 'create'
                  ? 'bg-[#3d7a47] text-white border-[#244e2b]'
                  : 'bg-[#e6cfa8] text-[#4a3220] border-[#b89763] hover:bg-[#dcc091]'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>{t.createRoomTab}</span>
            </button>
          </div>

          {error && (
            <div className="px-3.5 py-2.5 rounded-lg bg-[#fee2e2] border border-[#dc2626] text-[#991b1b] text-xs font-semibold">
              {error}
            </div>
          )}

          {tab === 'create' ? (
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#4a3220] mb-1">
                  {t.roomNameLabel}
                </label>
                <input
                  type="text"
                  maxLength={28}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder={t.roomNamePlaceholder}
                  data-testid="room-name-input"
                  className="w-full px-3 py-2 rounded-lg bg-[#fff9ec] border-2 border-[#b89763] text-sm font-semibold text-[#2c1e14] focus:outline-none focus:border-[#3d7a47]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-xs font-bold cursor-pointer ${
                    isPublic
                      ? 'bg-[#dcfce7] border-[#16a34a] text-[#14532d]'
                      : 'bg-[#fbf2e1] border-[#d6be96] text-[#5c4028]'
                  }`}
                >
                  <Globe className="w-4 h-4 shrink-0" />
                  <span className="text-start">{t.publicRoomLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-xs font-bold cursor-pointer ${
                    !isPublic
                      ? 'bg-[#fef3c7] border-[#d97706] text-[#78350f]'
                      : 'bg-[#fbf2e1] border-[#d6be96] text-[#5c4028]'
                  }`}
                >
                  <Lock className="w-4 h-4 shrink-0" />
                  <span className="text-start">{t.privateRoomLabel}</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                data-testid="create-room-submit"
                className="wood-button-primary w-full py-2.5 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-60"
              >
                {loading ? '...' : t.createAndPlayBtn}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Join by code */}
              <form onSubmit={handleJoinCode} className="space-y-1.5">
                <label className="block text-xs font-bold text-[#4a3220]">
                  {t.joinByCodeLabel}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={8}
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder={t.roomCodePlaceholder}
                    data-testid="room-code-input"
                    className="flex-1 px-3 py-2 rounded-lg bg-[#fff9ec] border-2 border-[#b89763] font-mono-tabular uppercase tracking-wider text-sm font-bold text-[#2c1e14] focus:outline-none focus:border-[#3d7a47]"
                  />
                  <button
                    type="submit"
                    disabled={loading || !roomCode.trim()}
                    data-testid="join-code-submit"
                    className="wood-button-primary px-4 py-2 rounded-lg text-xs sm:text-sm font-bold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {t.joinRoomBtn}
                  </button>
                </div>
              </form>

              {/* Public Rooms List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#4a3220]">{t.publicRoomsHeader}</span>
                  <button
                    type="button"
                    onClick={() => onRefreshRooms(serverUrl)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#e6cfa8] hover:bg-[#d8bd8e] border border-[#b89763] text-[11px] font-bold text-[#3d2817] cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    <span>{t.refreshRoomsBtn}</span>
                  </button>
                </div>

                {rooms.length === 0 ? (
                  <div className="p-4 rounded-lg bg-[#fbf2e1] border border-[#d6be96] text-center text-xs text-[#694d36]">
                    {t.noPublicRooms}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {rooms.map((rm) => (
                      <div
                        key={rm.code}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#fbf2e1] border-2 border-[#d6be96]"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[#2c1e14] truncate">
                              {rm.name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[#e6cfa8] border border-[#b89763] font-mono-tabular text-[10px] font-bold text-[#4a3220]">
                              {rm.code}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#694d36] flex flex-wrap items-center gap-2 mt-0.5">
                            <span>
                              {t.hostLabel}: {rm.hostName}
                            </span>
                            <span>·</span>
                            <span>
                              {translateSeason(rm.season, lang)} · {t.dayWord} {rm.day}
                            </span>
                            <span>·</span>
                            <span className="font-bold text-[#2f6f3b]">
                              {t.playersCountLabel.replace('{n}', String(rm.playerCount))}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={loading || rm.playerCount >= rm.maxPlayers}
                          onClick={() => {
                            const cleanPlayer =
                              playerName.trim() || (lang === 'ar' ? 'مزارع' : 'Farmer');
                            savePlayerName(cleanPlayer);
                            saveMultiplayerServerUrl(serverUrl);
                            onJoinRoom({ code: rm.code, playerName: cleanPlayer, serverUrl });
                          }}
                          className="wood-button-primary px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer shrink-0 disabled:opacity-50"
                        >
                          {t.joinRoomBtn}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Optional Custom Server URL for APK / EXE / Static Vercel */}
          <div className="pt-2 border-t border-[#d4ba8f]">
            <button
              type="button"
              onClick={() => setShowServerConfig((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#694d36] hover:text-[#2c1e14] cursor-pointer"
            >
              <Server className="w-3.5 h-3.5" />
              <span>{t.customServerLabel}</span>
            </button>
            {showServerConfig && (
              <div className="mt-2 space-y-1.5 p-2.5 rounded-lg bg-[#fbf2e1] border border-[#d6be96]">
                <div className="flex gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={serverUrl}
                    onChange={(e) => {
                      setServerUrl(e.target.value);
                      saveMultiplayerServerUrl(e.target.value);
                    }}
                    placeholder="https://your-ecogrow-server.onrender.com"
                    className="flex-1 px-2.5 py-1.5 rounded bg-white border border-[#b89763] text-xs font-mono-tabular text-[#2c1e14] focus:outline-none focus:border-[#3d7a47]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setServerUrl('');
                      saveMultiplayerServerUrl('');
                    }}
                    className="px-2.5 py-1.5 rounded bg-[#e6cfa8] border border-[#b89763] text-[11px] font-bold text-[#3d2817] cursor-pointer"
                  >
                    {t.serverDefaultBtn}
                  </button>
                </div>
                <p className="text-[11px] text-[#694d36]">{t.customServerHint}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
