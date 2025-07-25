import React, { useEffect } from 'react';
import './App.css';

// Function to copy text to clipboard
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return true;
  }
};

// Banner states: waiting, shot, goal, win
export default function Banner({
  state = 'shot',
  playerName = '',
  opponentName = '',
  winnerName = '',
  goalMessage = '',
  onGoalTimeout = () => {},
  currentTurn = 1,
  playerNumber = null,
  roomId = '',
  sandboxMode = false,
}) {
  useEffect(() => {
    if (state === 'goal') {
      const timer = setTimeout(() => {
        onGoalTimeout();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state, onGoalTimeout]);

  const handleCopyLink = async () => {
    const gameUrl = `${window.location.origin}/play/${roomId}`;
    const success = await copyToClipboard(gameUrl);
    if (success) {
      // Could add a toast notification here
      console.log('Game link copied to clipboard!');
    }
  };

  let bannerText = '';
  let bannerClass = 'banner banner-green';

  if (state === 'waiting') {
    bannerText = 'Waiting for another player to join...';
    bannerClass = 'banner banner-gray';
  } else if (state === 'shot') {
    // Determine if it's the current player's turn or opponent's turn
    if (playerNumber === currentTurn) {
      bannerClass = 'banner banner-green'; // Your shot - blue
    } else {
      bannerClass = 'banner banner-pink'; // Opponent's shot - pink
    }
  } else if (state === 'goal') {
    bannerText = goalMessage || `${playerName} scores!`;
    bannerClass = 'banner banner-green';
  } else if (state === 'win') {
    bannerText = `${winnerName} wins!`;
    bannerClass = 'banner banner-green';
  }

  return (
    <div className={bannerClass}>
      {state === 'shot' ? (
        <>
          <div className="banner-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="2" fill="#90d0e5"/>
              <circle cx="12" cy="12" r="6" stroke="#90d0e5" strokeWidth="1" fill="none"/>
              <circle cx="12" cy="12" r="10" stroke="#90d0e5" strokeWidth="1" fill="none"/>
              <line x1="6" y1="12" x2="18" y2="12" stroke="#90d0e5" strokeWidth="1"/>
              <line x1="12" y1="6" x2="12" y2="18" stroke="#90d0e5" strokeWidth="1"/>
            </svg>
          </div>
          <div className="banner-content">
            <div className="banner-text">
              <span className="player-name">
                {playerNumber === currentTurn ? 'Your' : 'Opponent\'s'}
              </span>
              <span className="action-text"> Shot</span>
            </div>
            <div className="banner-subtext">
              {playerNumber === currentTurn ? playerName : opponentName}
            </div>
          </div>
        </>
      ) : state === 'waiting' ? (
        <>
          <div className="banner-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="2" fill="#808080"/>
              <circle cx="12" cy="12" r="6" stroke="#808080" strokeWidth="1" fill="none"/>
              <circle cx="12" cy="12" r="10" stroke="#808080" strokeWidth="1" fill="none"/>
              <line x1="6" y1="12" x2="18" y2="12" stroke="#808080" strokeWidth="1"/>
              <line x1="12" y1="6" x2="12" y2="18" stroke="#808080" strokeWidth="1"/>
            </svg>
          </div>
          <div className="banner-content">
            <div className="banner-text">
              <span className="player-name">Waiting...</span>
            </div>
          </div>
          <button 
            className="banner-copy-button"
            onClick={handleCopyLink}
          >
            Copy Link
          </button>
        </>
      ) : (
        <span className="banner-text">{bannerText}</span>
      )}
    </div>
  );
} 