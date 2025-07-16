'use client';

import { useRef } from 'react';

export default function ButtonWithSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleClick = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0; // Rewind to start
      audioRef.current.play();
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <button
        onClick={handleClick}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition"
      >
        Click Me
      </button>

      {/* Hidden audio element */}
      <audio ref={audioRef} src="/button-click.mp3" preload="auto" />
    </div>
  );
}
