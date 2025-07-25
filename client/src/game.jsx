import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import socket from './socket';
import GameField from './GameField';
import { vecAdd, vecScale, vecMag } from './physics';
import Banner from './Banner';

function Game() {
  const { roomId } = useParams();

  // All hooks must be declared before any early return
  // --- State and refs ---
  const [bannerState, setBannerState] = useState('shot');
  const [ballPos, setBallPos] = useState({ x: 420 / 2, y: 700 / 2 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [isTouch, setIsTouch] = useState(false);
  const [playerNumber, setPlayerNumber] = useState(null);
  const [currentTurn, setCurrentTurn] = useState(1);
  const [score, setScore] = useState({ 1: 0, 2: 0 });
  const [goalMessage, setGoalMessage] = useState('');
  const [showGoalToast, setShowGoalToast] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [playerNames, setPlayerNames] = useState({ 1: '', 2: '' });
  const [showNameDialog, setShowNameDialog] = useState(true);
  const [playerName, setPlayerName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [sandboxMode, setSandboxMode] = useState(false);
  const [realGameState, setRealGameState] = useState({
    ballPos: { x: 420 / 2, y: 700 / 2 },
    score: { 1: 0, 2: 0 },
    currentTurn: 1
  });
  const lastBallPos = useRef(ballPos);
  const ballAngleRef = useRef(0);
  const [ballAngle, setBallAngle] = useState(0);
  const touchStartRef = useRef(null);
  const svgRef = useRef();
  const isSyncingRef = useRef(false);
  const playerNumberRef = useRef(null);

  // --- Constants (move to top so all handlers can access) ---
  const FIELD_WIDTH = 420;
  const FIELD_HEIGHT = 700;
  const BALL_RADIUS = 12;
  const PEG_RADIUS = 7;
  const topPegs = [
    { x: 100, y: 75 }, { x: 210, y: 90 }, { x: 320, y: 75 },
    { x: 160, y: 60 }, { x: 260, y: 60 },
    { x: 175, y: 140 }, { x: 245, y: 140 },
    { x: 115, y: 165 }, {x:310, y:165}, {x:210, y:235}
  ];
  const bottomPegs = topPegs.map(peg => ({ x: peg.x, y: FIELD_HEIGHT - peg.y }));
  const pegs = [...topPegs, ...bottomPegs];
  const WIN_SCORE = 3;
  
  // Clutch mode: activate when either player is about to win OR when both players are at 2-2
  const clutchActive = (playerNumber === 1 && score[1] === WIN_SCORE - 1 && score[2] < WIN_SCORE - 1) || 
                      (playerNumber === 2 && score[2] === WIN_SCORE - 1 && score[1] < WIN_SCORE - 1) ||
                      (score[1] === 2 && score[2] === 2);

  // --- Effects ---
  useEffect(() => {
    // Handle viewport changes for mobile browsers
    const handleViewportChange = () => {
      // Force a reflow to ensure proper sizing
      const container = document.querySelector('.binho-field-container');
      if (container) {
        container.style.display = 'none';
        container.offsetHeight; // Force reflow
        container.style.display = 'flex';
      }
    };

    // Listen for orientation changes and resize events
    window.addEventListener('orientationchange', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    
    // Handle visual viewport changes (Safari URL bar, etc.)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
    }

    // Initial call to ensure proper sizing
    handleViewportChange();

    return () => {
      window.removeEventListener('orientationchange', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
      }
    };
  }, []);

  useEffect(() => {
    if (!playerNames[1] || !playerNames[2]) {
      setBannerState('waiting');
      // Enable sandbox mode when waiting for opponent
      setSandboxMode(true);
    } else if (showGoalToast) {
      setBannerState('goal');
      setSandboxMode(false);
    } else if (gameOver) {
      setBannerState('win');
      setSandboxMode(false);
    } else {
      setBannerState('shot');
      setSandboxMode(false);
    }
  }, [playerNames, showGoalToast, gameOver]);

  useEffect(() => {
    if (playerNames[1] && playerNames[2]) {
      document.title = `Biñho - ${playerNames[1]} vs ${playerNames[2]}`;
    } else {
      document.title = 'Biñho - Waiting for another player to join';
    }
  }, [playerNames]);

  useEffect(() => {
    const dx = ballPos.x - lastBallPos.current.x;
    const dy = ballPos.y - lastBallPos.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const circumference = 2 * Math.PI * 12;
    const angleDelta = (dist / circumference) * 360;
    const sign = dx >= 0 ? 1 : -1;
    ballAngleRef.current += angleDelta * sign;
    setBallAngle(ballAngleRef.current);
    lastBallPos.current = ballPos;
  }, [ballPos.x, ballPos.y]);

  useEffect(() => {
    function handleGlobalTouchMove(e) {
      if (dragging && isTouch && e.touches.length === 1) {
        e.preventDefault();
        const { x, y } = getSvgCoords(e.touches[0].clientX, e.touches[0].clientY);
        setDragEnd({ x, y });
      }
    }
    function handleGlobalTouchEnd(e) {
      console.log(`📱 Global touch end: dragging=${dragging}, isTouch=${isTouch}`);
      if (dragging && isTouch) {
        e.preventDefault();
        // Use the same logic as mouse up
        if (dragStart && dragEnd) {
          const dx = dragStart.x - dragEnd.x;
          const dy = dragStart.y - dragEnd.y;
          const velocityScale = 0.5;
          let vx = dx * velocityScale;
          let vy = dy * velocityScale;
          const maxSpeed = 40;
          const currentSpeed = Math.sqrt(vx * vx + vy * vy);
          if (currentSpeed > maxSpeed) {
            const scale = maxSpeed / currentSpeed;
            vx *= scale;
            vy *= scale;
          }
          console.log(`🚀 Global touch end emitting ball-move: roomId=${roomId}, velocity=(${vx.toFixed(2)}, ${vy.toFixed(2)})`);
          socket.emit('ball-move', { roomId, velocity: { x: vx, y: vy } });
          setDragging(false);
          setDragStart(null);
          setDragEnd(null);
        }
      }
    }
    if (dragging && isTouch) {
      document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
      document.addEventListener('touchend', handleGlobalTouchEnd, { passive: false });
    }
    return () => {
      document.removeEventListener('touchmove', handleGlobalTouchMove, { passive: false });
      document.removeEventListener('touchend', handleGlobalTouchEnd, { passive: false });
    };
  }, [dragging, isTouch, dragStart, dragEnd, roomId]);

  useEffect(() => {
    function handleGlobalMouseMove(e) {
      if (dragging && !isTouch) {
        const { x, y } = getSvgCoords(e.clientX, e.clientY);
        setDragEnd({ x, y });
      }
    }
    function handleGlobalMouseUp(e) {
      console.log(`🖱️ Global mouse up: dragging=${dragging}, isTouch=${isTouch}, dragStart=${!!dragStart}, dragEnd=${!!dragEnd}`);
      if (dragging && !isTouch && dragStart && dragEnd) {
        const dx = dragStart.x - dragEnd.x;
        const dy = dragStart.y - dragEnd.y;
        const velocityScale = 0.5;
        let vx = dx * velocityScale;
        let vy = dy * velocityScale;
        const maxSpeed = 40;
        const currentSpeed = Math.sqrt(vx * vx + vy * vy);
        if (currentSpeed > maxSpeed) {
          const scale = maxSpeed / currentSpeed;
          vx *= scale;
          vy *= scale;
        }
        console.log(`🚀 Global mouse up emitting ball-move: roomId=${roomId}, velocity=(${vx.toFixed(2)}, ${vy.toFixed(2)})`);
        socket.emit('ball-move', { roomId, velocity: { x: vx, y: vy } });
        setDragging(false);
        setDragStart(null);
        setDragEnd(null);
      }
    }
    if (dragging && !isTouch) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragging, isTouch, dragStart, dragEnd, roomId]);

  useEffect(() => {
    function handleSocketError(err) {
      console.error('❌ Socket error event:', err);
      if (window && window.alert) {
        window.alert('Socket error: ' + (err && err.message ? err.message : err));
      }
    }
    socket.on('error', handleSocketError);
    return () => {
      socket.off('error', handleSocketError);
    };
  }, []);

  // --- Handlers used in early return ---
  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (playerName.trim()) {
      setNameSubmitted(true);
      setShowNameDialog(false);
    }
  };

  // Allow shooting if it's this player's turn OR if we're in sandbox mode
  const canShoot = () => {
    const can = sandboxMode || playerNumber === currentTurn;
    console.log(`🎯 canShoot check: playerNumber=${playerNumber}, currentTurn=${currentTurn}, sandboxMode=${sandboxMode}, canShoot=${can}, playerNumberRef=${playerNumberRef.current}`);
    return can;
  };

  // Debug socket connection status
  useEffect(() => {
    console.log('🔌 Socket connection status:', {
      connected: socket.connected,
      id: socket.id,
      backendUrl: socket.io.uri
    });
  }, []);

  // Dynamic height calculation for mobile viewport
  useEffect(() => {
    const calculateFieldHeight = () => {
      const header = document.querySelector('.scorebug-header');
      const banner = document.querySelector('.banner');
      const gameplayStack = document.querySelector('.gameplay-stack');
      
      if (header && banner && gameplayStack) {
        const headerHeight = header.offsetHeight;
        const bannerHeight = banner.offsetHeight;
        const stackPadding = parseInt(window.getComputedStyle(gameplayStack).paddingTop) + 
                            parseInt(window.getComputedStyle(gameplayStack).paddingBottom);
        const stackGap = parseInt(window.getComputedStyle(gameplayStack).gap) || 16;
        
        // Calculate available height for the field
        const availableHeight = window.innerHeight - headerHeight - bannerHeight - stackPadding - stackGap;
        
        // Set the field shell height
        const fieldShell = document.querySelector('.game-field-shell');
        if (fieldShell) {
          fieldShell.style.height = `${Math.max(availableHeight, 300)}px`;
          console.log('📏 Field height calculated:', {
            windowHeight: window.innerHeight,
            headerHeight,
            bannerHeight,
            stackPadding,
            stackGap,
            availableHeight,
            finalHeight: Math.max(availableHeight, 300)
          });
        }
      }
    };

    // Calculate on mount and resize
    calculateFieldHeight();
    window.addEventListener('resize', calculateFieldHeight);
    window.addEventListener('orientationchange', calculateFieldHeight);
    
    // Handle visual viewport changes (Safari URL bar, etc.)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', calculateFieldHeight);
    }

    return () => {
      window.removeEventListener('resize', calculateFieldHeight);
      window.removeEventListener('orientationchange', calculateFieldHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', calculateFieldHeight);
      }
    };
  }, []);

  // Convert screen coords to SVG coords
  const getSvgCoords = (clientX, clientY) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: svgP.x, y: svgP.y };
  };

  // Add global touch tracking
  useEffect(() => {
    console.log('useEffect triggered with:', { roomId, nameSubmitted, playerName });
    if (roomId && nameSubmitted) {
      console.log('Emitting join-room:', roomId, playerName); // Debug log
      socket.emit('join-room', { roomId, name: playerName });
      console.log('Joining room:', roomId, 'with name:', playerName);
    } else {
      console.log('NOT emitting join-room because:', { 
        roomId: roomId, 
        nameSubmitted: nameSubmitted, 
        playerName: playerName 
      });
    }

    socket.on('joined-room', ({ socketId, playerNumber, currentTurn, playerNames: names }) => {
      console.log(`🎯 Setting playerNumber to ${playerNumber} for socket ${socketId} (my socket: ${socket.id})`);
      if (socketId === socket.id) {
        console.log(`✅ This is MY joined-room event`);
        setPlayerNumber(playerNumber);
        playerNumberRef.current = playerNumber;
        setCurrentTurn(currentTurn);
        setPlayerNames(names);
        setShowNameDialog(false);
        console.log(`✅ Joined as Player ${playerNumber} (socket ${socketId}), current turn: ${currentTurn}`);
      } else {
        console.log(`❌ This is NOT my joined-room event, ignoring`);
      }
    });

    // Handle when another player joins (exiting sandbox mode)
    socket.on('player-joined', ({ playerNames: names, currentTurn, ballPos, score }) => {
      console.log(`🎯 Another player joined, exiting sandbox mode`);
      console.log(`🎯 Received score:`, score);
      console.log(`🎯 Current score state:`, score);
      setPlayerNames(names);
      setCurrentTurn(currentTurn);
      setSandboxMode(false);
      // Reset ball to starting position when real game begins
      setBallPos({ x: 420 / 2, y: 700 / 2 });
      setScore(score);
    });

    socket.on('turn-update', ({ currentTurn, playerNames: names }) => {
      console.log(`🔄 Turn update: currentTurn = ${currentTurn}, playerNumber = ${playerNumberRef.current}, playerNames =`, names);
      setCurrentTurn(currentTurn);
      setPlayerNames(names);
    });

    socket.on('score-update', ({ score, playerNames: names }) => {
      console.log(`🎯 Score update received:`, score);
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

    // Handle sandbox goals (reset ball without affecting score)
    socket.on('sandbox-goal', ({ ballPos }) => {
      console.log(`🎯 Sandbox goal scored, resetting ball`);
      setBallPos(ballPos);
    });

    // Game over dialog
    // Show when a player reaches WIN_SCORE
    socket.on('game-over', ({ winner, score, playerNames: names }) => {
      console.log(`🎯 Game over received: winner=${winner}, score=`, score);
      setGameOver(true);
      setWinner(winner);
      setScore(score); // Update the score to show the final result
      setPlayerNames(names);
    });
    socket.on('game-restarted', () => {
      setGameOver(false);
      setWinner(null);
    });

    return () => {
      socket.emit('leave-room', roomId);
      socket.off('joined-room');
      socket.off('player-joined');
      socket.off('turn-update');
      socket.off('score-update');
      socket.off('goal');
      socket.off('sandbox-goal');
      socket.off('ball-move');
      socket.off('game-over');
      socket.off('game-restarted');
    };
  }, [roomId, nameSubmitted, playerName]);

  // Debug playerNumber changes
  useEffect(() => {
    console.log(`🔍 playerNumber changed to: ${playerNumber} (stack trace: ${new Error().stack?.split('\n')[2]?.trim()})`);
    playerNumberRef.current = playerNumber;
  }, [playerNumber]);

  // Add global socket error handler for debugging
  useEffect(() => {
    function handleSocketError(err) {
      console.error('❌ Socket error event:', err);
      if (window && window.alert) {
        window.alert('Socket error: ' + (err && err.message ? err.message : err));
      }
    }
    socket.on('error', handleSocketError);
    return () => {
      socket.off('error', handleSocketError);
    };
  }, []);

  // --- Handlers for pointer/touch events ---
  const handlePointerDown = (e) => {
    console.log(`👆 handlePointerDown called`);
    if (typeof canShoot === 'function' && !canShoot()) {
      console.log(`❌ handlePointerDown blocked by canShoot`);
      return;
    }
    console.log(`✅ handlePointerDown proceeding`);
    let clientX, clientY;
    if (e.touches && e.touches.length === 1) {
      if (typeof setIsTouch === 'function') setIsTouch(true);
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.clientX !== undefined) {
      if (typeof setIsTouch === 'function') setIsTouch(false);
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }
    const { x, y } = getSvgCoords(clientX, clientY);
    setDragging(true);
    setDragStart({ x, y });
    setDragEnd({ x, y });
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



  const handleRestart = () => {
    socket.emit('restart-game', roomId);
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

  // Banner state logic (must be before any early returns)
  // This block is now redundant as the hooks are moved to the top.
  // Keeping it for now as per instructions, but it will be removed if not used.
  // const [bannerState, setBannerState] = useState('shot');
  // useEffect(() => {
  //   if (!playerNames[1] || !playerNames[2]) {
  //     setBannerState('waiting');
  //   } else if (showGoalToast) {
  //     setBannerState('goal');
  //   } else if (gameOver) {
  //     setBannerState('win');
  //   } else {
  //     setBannerState('shot');
  //   }
  // }, [playerNames, showGoalToast, gameOver]);

  return (
    <div className="gameplay-outer">
      <div className="gameplay-stack">
        <div className="scorebug-header">
          <span className="scorebug-player-name" style={{textAlign:'left'}}>{playerNames[1] || 'Player 1'}</span>
          <div className="scorebug-score">
            <span className="scorebug-score-num">{score[1]}</span>
            <span className="scorebug-score-divider">-</span>
            <span className="scorebug-score-num">{score[2]}</span>
          </div>
          <span className="scorebug-player-name" style={{textAlign:'right'}}>{playerNames[2] || 'Waiting...'}</span>
        </div>
        <div className="game-field-shell">
          <GameField
            FIELD_WIDTH={FIELD_WIDTH}
            FIELD_HEIGHT={FIELD_HEIGHT}
            PEG_RADIUS={PEG_RADIUS}
            BALL_RADIUS={BALL_RADIUS}
            pegs={pegs}
            ballPos={ballPos}
            dragging={dragging}
            setDragging={setDragging}
            dragStart={dragStart}
            setDragStart={setDragStart}
            dragEnd={dragEnd}
            setDragEnd={setDragEnd}
            isTouch={isTouch}
            setIsTouch={setIsTouch}
            playerNumber={playerNumber}
            canShoot={canShoot}
            handleMouseDown={handlePointerDown}
            handleMouseMove={handlePointerMove}
            handleTouchStart={handlePointerDown}
            handleTouchMove={handlePointerMove}
            svgRef={svgRef}
            ballAngle={ballAngle}
            clutchActive={clutchActive}
          />
        </div>
        <Banner
          state={bannerState}
          playerName={playerNames[currentTurn] || `p${currentTurn}`}
          opponentName={playerNames[currentTurn === 1 ? 2 : 1]}
          winnerName={playerNames[winner]}
          goalMessage={goalMessage}
          onGoalTimeout={() => setShowGoalToast(false)}
          currentTurn={currentTurn}
          playerNumber={playerNumber}
          roomId={roomId}
          sandboxMode={sandboxMode}
        />
      </div>
      {/* Remove old Goal Toast Message */}
      {gameOver && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: '#fff', padding: 40, borderRadius: 20, boxShadow: '0 4px 24px #0008', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2em', marginBottom: 20, color: '#333' }}>Game Over</h2>
            <div style={{ fontSize: '1.5em', marginBottom: 20, color: '#333' }}>
              {playerNames[winner] || `Player ${winner}`} wins {score[1]}-{score[2]}!
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
