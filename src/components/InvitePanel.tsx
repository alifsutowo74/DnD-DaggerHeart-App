import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { RoomState } from '../../shared/types.ts';

export default function InvitePanel({ room }: { room: RoomState }) {
  const link = `${window.location.origin}/?join=${room.code}`;
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(room.mode === 'table');

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 320, color: { dark: '#15121c', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [link]);

  const copy = async () => {
    const text =
      room.mode === 'online'
        ? `Join my ${room.system === 'dnd5e' ? 'D&D' : 'Daggerheart'} game: ${link} (code ${room.code})`
        : link;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt('Copy this invite:', text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="card invite">
      <h2>Invite players</h2>
      <p className="muted small">
        {room.mode === 'online'
          ? 'Paste the link in your Discord channel. Players open it and type their name.'
          : 'Players scan the code with their phone camera, or go to the site and type the code.'}
      </p>
      <div className="big-code" aria-label={`Lobby code ${room.code}`}>
        {room.code.split('').map((c, i) => (
          <span key={i}>{c}</span>
        ))}
      </div>
      <div className="row">
        <button className="btn primary" onClick={copy}>{copied ? 'Copied!' : 'Copy invite link'}</button>
        <button className="btn ghost" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
          {showQr ? 'Hide QR' : 'Show QR'}
        </button>
      </div>
      {showQr && qr && <img className="qr" src={qr} alt={`QR code to join lobby ${room.code}`} />}
    </section>
  );
}
