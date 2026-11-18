import { useCallback, useEffect, useState } from 'react';
import type { RollResult, RoomState, SessionInfo } from '../shared/types.ts';
import { request, socket } from './socket.ts';
import { loadSession, saveSession } from './session.ts';
import Home from './components/Home.tsx';
import Lobby from './components/Lobby.tsx';

export interface Seat {
  code: string;
  playerId: string;
}

export default function App() {
  const [seat, setSeat] = useState<Seat | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [rolls, setRolls] = useState<RollResult[]>([]);
  const [connected, setConnected] = useState(socket.connected);
  const [restoring, setRestoring] = useState(() => loadSession() !== null);

  const enterSession = useCallback((s: SessionInfo) => {
    saveSession({ code: s.code, token: s.token });
    setSeat({ code: s.code, playerId: s.playerId });
    setRoom(s.state);
    setRolls(s.rolls);
    const url = new URL(window.location.href);
    url.searchParams.delete('join');
    window.history.replaceState(null, '', url);
  }, []);

  // Live updates from the server.
  useEffect(() => {
    const onState = (state: RoomState) => setRoom(state);
    const onRoll = (roll: RollResult) =>
      setRolls((prev) => (prev.some((r) => r.id === roll.id) ? prev : [...prev, roll].slice(-200)));
    socket.on('room:state', onState);
    socket.on('dice:rolled', onRoll);
    return () => {
      socket.off('room:state', onState);
      socket.off('dice:rolled', onRoll);
    };
  }, []);

  // (Re)connect: put the player back in their seat after a refresh or a dropped connection.
  useEffect(() => {
    const onConnect = async () => {
      setConnected(true);
      const saved = loadSession();
      if (!saved) {
        setRestoring(false);
        return;
      }
      try {
        enterSession(await request('room:rejoin', saved));
      } catch {
        saveSession(null);
        setSeat(null);
        setRoom(null);
      } finally {
        setRestoring(false);
      }
    };
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) void onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [enterSession]);

  const leave = () => {
    socket.emit('room:leave');
    saveSession(null);
    setSeat(null);
    setRoom(null);
    setRolls([]);
  };

  if (restoring) {
    return (
      <div className="center-screen">
        <div className="spinner" aria-hidden />
        <p>Finding your seat…</p>
      </div>
    );
  }

  if (seat && room) {
    return (
      <Lobby
        room={room}
        me={seat.playerId}
        rolls={rolls}
        connected={connected}
        onAddLocalRoll={(r) => setRolls((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]))}
        onLeave={leave}
      />
    );
  }

  return <Home connected={connected} onEnter={enterSession} />;
}
