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

  // Mouse and touch handlers (unified drag-to-shoot)
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

  const handlePointerMove = (e) => {
    if (!dragging) return;
    let clientX, clientY;
    if (e.touches && e.touches.length === 1) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.clientX !== undefined) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }
    const { x, y } = getSvgCoords(clientX, clientY);
    setDragEnd({ x, y });
  };

  const handlePointerUp = (e) => {
    if (dragging && dragStart && dragEnd) {
      const dx = dragStart.x - dragEnd.x;
      const dy = dragStart.y - dragEnd.y;
      const velocityScale = 0.5; // Lowered for less sensitive shots
      const vx = dx * velocityScale;
      const vy = dy * velocityScale;
      // Send velocity to server
      socket.emit('ball-move', { roomId, velocity: { x: vx, y: vy } });
    }
    setDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  // Remove old mouse/touch handlers

  useEffect(() => {
    if (roomId) {
      socket.emit('join-room', roomId);
      console.log('Joining room:', roomId);
    }

    socket.on('joined-room', ({ socketId, playerNumber, currentTurn }) => {
      setPlayerNumber(playerNumber);
      setCurrentTurn(currentTurn);
      console.log(`✅ Joined as Player ${playerNumber} (socket ${socketId}), current turn: ${currentTurn}`);
    });

    socket.on('turn-update', ({ currentTurn }) => {
      setCurrentTurn(currentTurn);
      console.log(`🔄 Turn update: currentTurn = ${currentTurn}, playerNumber = ${playerNumber}`);
    });

    socket.on('score-update', ({ score }) => {
      setScore(score);
    });

    socket.on('goal', ({ scoringPlayer, score, ballPos }) => {
      setScore(score);
      setBallPos(ballPos);
      setGoalMessage(`Goal! Player ${scoringPlayer} scored!`);
      setTimeout(() => setGoalMessage(''), 2000);
    });

    // Listen for ball-move events from server
    socket.on('ball-move', ({ ballPos }) => {
      isSyncingRef.current = true;
      setBallPos(ballPos);
      setTimeout(() => { isSyncingRef.current = false; }, 0);
    });

    // Game over dialog
    socket.on('game-over', ({ winner, score }) => {
      setGameOver(true);
      setWinner(winner);
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
  }, [roomId]);

  const handleRestart = () => {
    socket.emit('restart-game', roomId);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h1>Binho Mobile</h1>
      <div style={{ fontSize: '2em', fontWeight: 'bold', margin: '0.5em 0' }}>
        P1 {score[1]} - {score[2]} P2
      </div>
      <div style={{ fontSize: '1.2em', marginBottom: 10 }}>Room ID: {roomId}</div>
      <div style={{ fontSize: '1.5em', color: '#333', marginBottom: 10 }}>
        {playerNumber === currentTurn ? 'Your turn' : "Opponent's turn"}
      </div>
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
      <div style={{ marginTop: 10, fontSize: '1.5em', color: '#fff' }}>
        {goalMessage}
      </div>
      {gameOver && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: '#fff', padding: 40, borderRadius: 20, boxShadow: '0 4px 24px #0008', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2em', marginBottom: 20 }}>Game Over</h2>
            <div style={{ fontSize: '1.5em', marginBottom: 20 }}>
              Player {winner} wins!
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
