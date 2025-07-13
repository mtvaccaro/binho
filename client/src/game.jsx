import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import socket from './socket';
import GameField from './GameField';
import { vecAdd, vecScale, vecMag } from './physics';

function Game() {
  const { roomId } = useParams();

  // Portrait field dimensions
  const FIELD_WIDTH = 420;
  const FIELD_HEIGHT = 700;
  const BALL_RADIUS = 12;
  const PEG_RADIUS = 7;

  // User-provided top peg positions
  const topPegs = [
    { x: 100, y: 75 }, { x: 210, y: 90 }, { x: 320, y: 75 },
    { x: 160, y: 60 }, { x: 260, y: 60 },
    { x: 175, y: 140 }, { x: 245, y: 140 },
    { x: 115, y: 165 }, {x:310, y:165}, {x:210, y:235}
  ];
  // Mirror pegs for the bottom side
  const bottomPegs = topPegs.map(peg => ({ x: peg.x, y: FIELD_HEIGHT - peg.y }));
  const pegs = [...topPegs, ...bottomPegs];

  // Ball state
  const [ballPos, setBallPos] = useState({ x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [isTouch, setIsTouch] = useState(false);
  const [playerNumber, setPlayerNumber] = useState(null); // Assigned by server
  const [currentTurn, setCurrentTurn] = useState(1); // Synced from server
  const [score, setScore] = useState({ 1: 0, 2: 0 });
  const [goalMessage, setGoalMessage] = useState('');
  const [showGoalToast, setShowGoalToast] = useState(false);
  const touchStartRef = useRef(null);
  const svgRef = useRef();
  const isSyncingRef = useRef(false); // Prevent double moves
  const FRICTION = 0.985; // Friction coefficient per frame (tweak as needed)
  const MIN_VELOCITY = 0.5; // Minimum velocity to stop
  // Remove velocity, animRef, and related code
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const lastBallPos = useRef(ballPos);
  const ballAngleRef = useRef(0);
  const [ballAngle, setBallAngle] = useState(0);

  // Player names state
  const [playerNames, setPlayerNames] = useState({ 1: '', 2: '' });
  const [showNameDialog, setShowNameDialog] = useState(true);
  const [playerName, setPlayerName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);

  // Update ball angle on movement
  useEffect(() => {
    const dx = ballPos.x - lastBallPos.current.x;
    const dy = ballPos.y - lastBallPos.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Ball circumference = 2 * pi * r; angle increment = (distance / circumference) * 360
    const circumference = 2 * Math.PI * BALL_RADIUS;
    const angleDelta = (dist / circumference) * 360;
    // Use direction of movement to determine sign (optional, for realism)
    const sign = dx >= 0 ? 1 : -1;
    ballAngleRef.current += angleDelta * sign;
    setBallAngle(ballAngleRef.current);
    lastBallPos.current = ballPos;
  }, [ballPos.x, ballPos.y]);

  // Only allow shooting if it's this player's turn
  const canShoot = () => playerNumber === currentTurn;

  // Convert screen coords to SVG coords
  const getSvgCoords = (clientX, clientY) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: svgP.x, y: svgP.y };
  };

  // Add global mouse tracking
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (dragging && !isTouch) {
        const { x, y } = getSvgCoords(e.clientX, e.clientY);
        setDragEnd({ x, y });
      }
    };

    const handleGlobalMouseUp = (e) => {
      if (dragging && !isTouch && dragStart && dragEnd) {
        const dx = dragStart.x - dragEnd.x;
        const dy = dragStart.y - dragEnd.y;
        const velocityScale = 0.5;
        let vx = dx * velocityScale;
        let vy = dy * velocityScale;
        
        // Apply max speed limit
        const maxSpeed = 40; // Increased to 40
        const currentSpeed = Math.sqrt(vx * vx + vy * vy);
        if (currentSpeed > maxSpeed) {
          const scale = maxSpeed / currentSpeed;
          vx *= scale;
          vy *= scale;
        }
        
        socket.emit('ball-move', { roomId, velocity: { x: vx, y: vy } });
        setDragging(false);
        setDragStart(null);
        setDragEnd(null);
      }
    };

    if (dragging && !isTouch) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragging, isTouch, dragStart, dragEnd, roomId]);

  // Update handlePointerDown to not set isTouch for mouse
  const handlePointerDown = (e) => {
    if (!canShoot()) return;
    let clientX, clientY;
    if (e.touches && e.touches.length === 1) {
      setIsTouch(true);
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.clientX !== undefined) {
      setIsTouch(false);
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }
    const { x, y } = getSvgCoords(clientX, clientY);
    const dist = Math.hypot(x - ballPos.x, y - ballPos.y);
    if (dist <= BALL_RADIUS + 10) {
      setDragging(true);
      setDragStart({ x, y });
      setDragEnd({ x, y });
    }
  };

  // Update handlePointerMove to only handle touch
  const handlePointerMove = (e) => {
    if (!dragging || !isTouch) return;
    let clientX, clientY;
    if (e.touches && e.touches.length === 1) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      return;
    }
    const { x, y } = getSvgCoords(clientX, clientY);
    setDragEnd({ x, y });
  };

  // Update handlePointerUp to only handle touch
  const handlePointerUp = (e) => {
    if (dragging && dragStart && dragEnd && isTouch) {
      const dx = dragStart.x - dragEnd.x;
      const dy = dragStart.y - dragEnd.y;
      const velocityScale = 0.5;
      let vx = dx * velocityScale;
      let vy = dy * velocityScale;
      
      // Apply max speed limit
      const maxSpeed = 40; // Increased to 40
      const currentSpeed = Math.sqrt(vx * vx + vy * vy);
      if (currentSpeed > maxSpeed) {
        const scale = maxSpeed / currentSpeed;
        vx *= scale;
        vy *= scale;
      }
      
      socket.emit('ball-move', { roomId, velocity: { x: vx, y: vy } });
    }
    setDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  // Remove old mouse/touch handlers

  useEffect(() => {
    if (roomId && nameSubmitted) {
      socket.emit('join-room', { roomId, name: playerName });
      console.log('Joining room:', roomId, 'with name:', playerName);
    }

    socket.on('joined-room', ({ socketId, playerNumber, currentTurn, playerNames: names }) => {
      setPlayerNumber(playerNumber);
      setCurrentTurn(currentTurn);
      setPlayerNames(names);
      setShowNameDialog(false);
      console.log(`✅ Joined as Player ${playerNumber} (socket ${socketId}), current turn: ${currentTurn}`);
    });

    socket.on('turn-update', ({ currentTurn, playerNames: names }) => {
      setCurrentTurn(currentTurn);
      setPlayerNames(names);
      console.log(`🔄 Turn update: currentTurn = ${currentTurn}, playerNumber = ${playerNumber}`);
    });

    socket.on('score-update', ({ score, playerNames: names }) => {
      setScore(score);
      setPlayerNames(names);
    });

    socket.on('goal', ({ scoringPlayer, score, ballPos, playerNames: names }) => {
      setScore(score);
      setBallPos(ballPos);
      setPlayerNames(names);
      const scorerName = names[scoringPlayer] || `Player ${scoringPlayer}`;
      setGoalMessage(`${scorerName} scores!!`);
      setShowGoalToast(true);
      // Auto-hide after 2 seconds
      setTimeout(() => {
        setShowGoalToast(false);
        setGoalMessage('');
      }, 2000);
    });

    // Listen for ball-move events from server
    socket.on('ball-move', ({ ballPos }) => {
      isSyncingRef.current = true;
      setBallPos(ballPos);
      setTimeout(() => { isSyncingRef.current = false; }, 0);
    });

    // Game over dialog
    socket.on('game-over', ({ winner, score, playerNames: names }) => {
      setGameOver(true);
      setWinner(winner);
      setPlayerNames(names);
    });
    socket.on('game-restarted', () => {
      setGameOver(false);
      setWinner(null);
    });

    return () => {
      socket.emit('leave-room', roomId);
      socket.off('joined-room');
      socket.off('turn-update');
      socket.off('score-update');
      socket.off('goal');
      socket.off('ball-move');
      socket.off('game-over');
      socket.off('game-restarted');
    };
  }, [roomId, nameSubmitted, playerName]);

  const handleRestart = () => {
    socket.emit('restart-game', roomId);
  };

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (playerName.trim()) {
      setNameSubmitted(true);
    }
  };

  // Name input dialog
  if (showNameDialog) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 1000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ background: '#fff', padding: 40, borderRadius: 20, boxShadow: '0 4px 24px #0008', textAlign: 'center', maxWidth: '90vw' }}>
          <h2 style={{ fontSize: '2em', marginBottom: 20, color: '#333' }}>Enter Your Name</h2>
          <p style={{ fontSize: '1.2em', marginBottom: 20, color: '#666' }}>Room: {roomId}</p>
          <form onSubmit={handleNameSubmit}>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your name"
              style={{
                fontSize: '1.2em',
                padding: '0.7em 1em',
                borderRadius: 10,
                border: '2px solid #ddd',
                width: '100%',
                maxWidth: '300px',
                marginBottom: 20,
                outline: 'none'
              }}
              autoFocus
              maxLength={20}
            />
            <button
              type="submit"
              disabled={!playerName.trim()}
              style={{
                fontSize: '1.2em',
                padding: '0.7em 2em',
                borderRadius: 10,
                background: playerName.trim() ? '#222' : '#ccc',
                color: '#fff',
                border: 'none',
                cursor: playerName.trim() ? 'pointer' : 'not-allowed'
              }}
            >
              Join Game
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h1>Binho Mobile</h1>
      <div style={{ fontSize: '2em', fontWeight: 'bold', margin: '0.5em 0' }}>
        {playerNames[1] || 'Player 1'} {score[1]} - {score[2]} {playerNames[2] || 'Player 2'}
      </div>
      <div style={{ fontSize: '1.2em', marginBottom: 10 }}>Room ID: {roomId}</div>
      <div style={{ fontSize: '1.5em', color: '#333', marginBottom: 10 }}>
        {playerNumber === currentTurn ? 'Your turn' : `${playerNames[currentTurn] || `Player ${currentTurn}`}'s turn`}
      </div>
      
      {/* Goal Toast Message */}
      {showGoalToast && (
        <div style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #4CAF50, #45a049)',
          color: 'white',
          padding: '15px 30px',
          borderRadius: '25px',
          fontSize: '1.5em',
          fontWeight: 'bold',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          zIndex: 1001,
          animation: 'slideInDown 0.3s ease-out'
        }}>
          {goalMessage}
        </div>
      )}
      
      <div style={{ height: '90vh', width: '90vw', maxHeight: 700, maxWidth: 420, background: '#222', borderRadius: 20, boxShadow: '0 4px 24px #0006', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
        <GameField
          FIELD_WIDTH={FIELD_WIDTH}
          FIELD_HEIGHT={FIELD_HEIGHT}
          PEG_RADIUS={PEG_RADIUS}
          BALL_RADIUS={BALL_RADIUS}
          pegs={pegs}
          ballPos={ballPos}
          dragging={dragging}
          dragStart={dragStart}
          dragEnd={dragEnd}
          isTouch={isTouch}
          playerNumber={playerNumber}
          handleMouseDown={handlePointerDown}
          handleMouseMove={handlePointerMove}
          handleMouseUp={handlePointerUp}
          handleTouchStart={handlePointerDown}
          handleTouchMove={handlePointerMove}
          handleTouchEnd={handlePointerUp}
          svgRef={svgRef}
          ballAngle={ballAngle}
        />
      </div>
      
      {gameOver && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: '#fff', padding: 40, borderRadius: 20, boxShadow: '0 4px 24px #0008', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2em', marginBottom: 20 }}>Game Over</h2>
            <div style={{ fontSize: '1.5em', marginBottom: 20 }}>
              {playerNames[winner] || `Player ${winner}`} wins!
            </div>
            <button onClick={handleRestart} style={{ fontSize: '1.2em', padding: '0.7em 2em', borderRadius: 10, background: '#222', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Restart Game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Game;
