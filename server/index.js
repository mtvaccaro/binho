const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const app = express();

// Health check route for Railway and browsers
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Binho backend is running!',
    timestamp: new Date().toISOString()
  });
});

// Additional health check for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

const allowedOrigins = [
  'https://binho.vercel.app',
  'https://binho-production.up.railway.app',
  'https://binho-preview.up.railway.app',
  'http://localhost:5173',
  'http://localhost:3000',
  // Regex for Vercel preview branches
  /^https:\/\/binho-git-.*-mtvaccaros-projects\.vercel\.app$/
];

function dynamicCorsOrigin(origin, callback) {
  console.log('CORS origin:', origin);
  if (!origin) {
    console.log('CORS: No origin, allowing');
    return callback(null, true);
  }
  if (
    allowedOrigins.includes(origin) ||
    allowedOrigins.some(o => o instanceof RegExp && o.test(origin))
  ) {
    console.log('CORS: Allowed', origin);
    return callback(null, true);
  }
  console.log('CORS: Denied', origin);
  return callback(new Error('Not allowed by CORS: ' + origin), false);
}

app.use(cors({
  origin: dynamicCorsOrigin,
  credentials: true
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => dynamicCorsOrigin(origin, callback),
    credentials: true
  }
});

// Track room player assignments and turn
const roomPlayers = {}; // { roomId: [socketId1, socketId2] }
const roomTurns = {};   // { roomId: currentTurn }

// Add player names tracking
const roomNames = {}; // { roomId: { 1: name1, 2: name2 } }

// Add score tracking
const roomScores = {}; // { roomId: { 1: 0, 2: 0 } }

// Add ball state and physics per room
const roomBall = {}; // { roomId: { pos: {x, y}, vel: {x, y}, interval: ref } }
// Add sandbox mode tracking per room
const roomSandboxMode = {}; // { roomId: boolean }

// Add disconnect tracking with grace period
const disconnectedPlayers = {}; // { roomId: { socketId: timestamp } }
const DISCONNECT_GRACE_PERIOD = 30000; // 30 seconds grace period
const FRICTION = 0.96; // Increased friction for quicker ball slowdown
const MIN_VELOCITY = 0.5;
const PHYSICS_TICK = 1000 / 60; // 60Hz
const FIELD_WIDTH = 420;
const FIELD_HEIGHT = 700;
const BALL_RADIUS = 18;
// Add peg positions and radius
const PEG_RADIUS = 7;
const PEG_DAMPING = 0.5; // Stronger energy loss for pegs
const WINNING_SCORE = 3; // Keep in sync with client WIN_SCORE
const topPegs = [
  { x: 100, y: 70 }, { x: 210, y: 70 }, { x: 320, y: 70 },
  { x: 160, y: 50 }, { x: 260, y: 50 },
  { x: 160, y: 140 }, { x: 260, y: 140 },
  { x: 100, y: 190 }, { x: 320, y: 190 }, { x: 210, y: 220 }
];
const bottomPegs = topPegs.map(peg => ({ x: peg.x, y: FIELD_HEIGHT - peg.y }));
const pegs = [...topPegs, ...bottomPegs];

// Vector math and collision helpers
function vecSub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function vecMag(a) { return Math.sqrt(a.x * a.x + a.y * a.y); }
function vecNorm(a) { const mag = vecMag(a); return mag === 0 ? { x: 0, y: 0 } : { x: a.x / mag, y: a.y / mag }; }
function vecDot(a, b) { return a.x * b.x + a.y * b.y; }
function vecReflect(v, n) {
  const dot = vecDot(v, n);
  return { x: v.x - 2 * dot * n.x, y: v.y - 2 * dot * n.y };
}
function circlesCollide(a, rA, b, rB) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distSq = dx * dx + dy * dy;
  const radSum = rA + rB;
  return distSq <= radSum * radSum;
}

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);
  
    socket.on('join-room', ({ roomId, name }) => {
      console.log(`🎯 JOIN-ROOM: Socket ${socket.id} joining room ${roomId} with name: ${name}`);
      console.log(`🎯 Room state before join:`, {
        roomId,
        roomPlayers: roomPlayers[roomId],
        roomNames: roomNames[roomId],
        roomTurns: roomTurns[roomId],
        roomSandboxMode: roomSandboxMode[roomId]
      });
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room ${roomId} with name: ${name}`);
      if (!roomPlayers[roomId]) roomPlayers[roomId] = [null, null];
      if (!roomNames[roomId]) roomNames[roomId] = { 1: '', 2: '' };
      console.log(`[BEFORE JOIN] roomPlayers[${roomId}]:`, roomPlayers[roomId]);
      console.log(`[BEFORE JOIN] roomNames[${roomId}]:`, roomNames[roomId]);
      
      // Check if this socket is already in the room
      const existingSlot = roomPlayers[roomId].indexOf(socket.id);
      if (existingSlot !== -1) {
        // This socket is already in the room, just update the name and return
        console.log(`Socket ${socket.id} already in room at slot ${existingSlot + 1}, updating name`);
        roomNames[roomId][existingSlot + 1] = name;
        const playerNumber = existingSlot + 1;
        
        // Clear disconnected status if this is a reconnection
        if (disconnectedPlayers[roomId] && disconnectedPlayers[roomId][socket.id]) {
          console.log(`Clearing disconnected status for socket ${socket.id} in room ${roomId}`);
          delete disconnectedPlayers[roomId][socket.id];
        }
        
        io.to(socket.id).emit('joined-room', {
          socketId: socket.id,
          playerNumber,
          currentTurn: roomTurns[roomId],
          playerNames: roomNames[roomId]
        });
        io.to(roomId).emit('turn-update', { currentTurn: roomTurns[roomId], playerNames: roomNames[roomId] });
        return;
      }
      
      // Remove socket ID from both slots if present (for reconnection scenarios)
      if (roomPlayers[roomId][0] === socket.id) roomPlayers[roomId][0] = null;
      if (roomPlayers[roomId][1] === socket.id) roomPlayers[roomId][1] = null;
      // Ensure both slots are present
      roomPlayers[roomId] = [roomPlayers[roomId][0] || null, roomPlayers[roomId][1] || null];
      roomPlayers[roomId].length = 2;
      console.log(`[AFTER CLEANUP] roomPlayers[${roomId}]:`, roomPlayers[roomId]);
      // Assign to first available slot
      let assignedSlot = -1;
      console.log(`🎯 Attempting to assign ${name} (socket ${socket.id}) to room ${roomId}`);
      console.log(`🎯 Current room state: slot 0 = ${roomPlayers[roomId][0]}, slot 1 = ${roomPlayers[roomId][1]}`);
      console.log(`🎯 Disconnected players in this room:`, disconnectedPlayers[roomId] || {});
      
      if (roomPlayers[roomId][0] == null) {
        roomPlayers[roomId][0] = socket.id;
        roomNames[roomId][1] = name;
        assignedSlot = 0;
        console.log(`🎯 Assigned ${name} to slot 1 (Player 1)`);
      } else if (roomPlayers[roomId][1] == null) {
        roomPlayers[roomId][1] = socket.id;
        roomNames[roomId][2] = name;
        assignedSlot = 1;
        console.log(`🎯 Assigned ${name} to slot 2 (Player 2)`);
      } else {
        // Room full
        console.log('🎯 Room full, cannot join:', roomId);
        io.to(socket.id).emit('joined-room', { socketId: socket.id, playerNumber: null, currentTurn: null, playerNames: {} });
        return;
      }
      roomPlayers[roomId].length = 2;
      // Set turn to 1 if not set
      if (!roomTurns[roomId]) roomTurns[roomId] = 1;
      // Determine player number by index
      let playerNumber = roomPlayers[roomId].indexOf(socket.id) + 1;
      if (playerNumber !== 1 && playerNumber !== 2) {
        console.error('Error: playerNumber is not 1 or 2:', playerNumber, roomPlayers[roomId]);
        return;
      }
      console.log(`[AFTER ASSIGNMENT] roomPlayers[${roomId}]:`, roomPlayers[roomId]);
      console.log(`[AFTER ASSIGNMENT] roomNames[${roomId}]:`, roomNames[roomId]);
      console.log(`Emitting joined-room to socket ${socket.id} with playerNumber:`, playerNumber);
      // Emit joined-room to ONLY the joining player
      io.to(socket.id).emit('joined-room', {
        socketId: socket.id,
        playerNumber,
        currentTurn: roomTurns[roomId],
        playerNames: roomNames[roomId]
      });
      console.log(`Emitting turn-update to room ${roomId} with playerNames:`, roomNames[roomId]);
      io.to(roomId).emit('turn-update', { currentTurn: roomTurns[roomId], playerNames: roomNames[roomId] });
      // Initialize ball state if not present
      if (!roomBall[roomId]) {
        roomBall[roomId] = {
          pos: { x: 210, y: 350 },
          vel: { x: 0, y: 0 },
          interval: null,
        };
      }
      
      // Initialize sandbox mode if not present
      if (!roomSandboxMode[roomId]) {
        roomSandboxMode[roomId] = true; // Start in sandbox mode
      }
      
      console.log(`🎯 Room ${roomId} players after join:`, roomPlayers[roomId]);
      console.log(`🎯 Checking if both players are present:`, roomPlayers[roomId][0], '&&', roomPlayers[roomId][1]);
      // Check if this is the second player joining (exiting sandbox mode)
      if (roomPlayers[roomId][0] && roomPlayers[roomId][1]) {
        console.log(`🎯 Both players detected! Exiting sandbox mode for room ${roomId}`);
        // Both players are now in the room, exit sandbox mode
        roomSandboxMode[roomId] = false;
        // Reset ball to starting position for real game
        roomBall[roomId].pos = { x: 210, y: 350 };
        roomBall[roomId].vel = { x: 0, y: 0 };
        // Reset score to 0-0 when real game starts
        roomScores[roomId] = { 1: 0, 2: 0 };
        // Ensure Player 1 gets the first shot
        roomTurns[roomId] = 1;
        console.log(`🎯 Both players joined, exiting sandbox mode for room ${roomId}`);
        console.log(`🎯 Emitting player-joined with score:`, roomScores[roomId]);
        // Emit player-joined event to notify clients
        io.to(roomId).emit('player-joined', {
          playerNames: roomNames[roomId],
          currentTurn: roomTurns[roomId],
          ballPos: roomBall[roomId].pos,
          score: roomScores[roomId]
        });
        // Also emit score update to reset any sandbox scores
        console.log(`🎯 Emitting score-update with score:`, roomScores[roomId]);
        io.to(roomId).emit('score-update', { score: roomScores[roomId], playerNames: roomNames[roomId] });
        io.to(roomId).emit('turn-update', { currentTurn: roomTurns[roomId], playerNames: roomNames[roomId] });
      }
      
      // Send current ball position to joining player
      io.to(socket.id).emit('ball-move', { ballPos: roomBall[roomId].pos });
    });
  
    socket.on('ball-move', ({ roomId, ballPos, velocity }) => {
      // Only accept if it's this player's turn (optional: add turn check)
      // Set velocity and start physics loop
      if (!roomBall[roomId]) {
        roomBall[roomId] = {
          pos: { x: 210, y: 350 },
          vel: { x: 0, y: 0 },
          interval: null,
        };
      }
      // Compute velocity from current pos to ballPos if not provided
      const curPos = roomBall[roomId].pos;
      let vel = velocity;
      if (!vel) {
        vel = { x: ballPos.x - curPos.x, y: ballPos.y - curPos.y };
      }
      roomBall[roomId].vel = vel;
      // Start physics loop if not running
      if (!roomBall[roomId].interval) {
        roomBall[roomId].interval = setInterval(() => {
          const ball = roomBall[roomId];
          // Update position
          ball.pos.x += ball.vel.x;
          ball.pos.y += ball.vel.y;
          // 1. Check for goal BEFORE wall collision
          let goalScored = false;
          let scoringPlayer = null;
          // Top goal (Player 1 scores)
          if (
            ball.pos.y - BALL_RADIUS <= 0 &&
            ball.pos.x > FIELD_WIDTH / 2 - 36 &&
            ball.pos.x < FIELD_WIDTH / 2 + 36
          ) {
            goalScored = true;
            scoringPlayer = 1;
          }
          // Bottom goal (Player 2 scores)
          if (
            ball.pos.y + BALL_RADIUS >= FIELD_HEIGHT &&
            ball.pos.x > FIELD_WIDTH / 2 - 36 &&
            ball.pos.x < FIELD_WIDTH / 2 + 36
          ) {
            goalScored = true;
            scoringPlayer = 2;
          }
          if (goalScored) {
            console.log(`🎯 Goal scored in room ${roomId}, sandbox mode:`, roomSandboxMode[roomId]);
            console.log(`🎯 Current room players:`, roomPlayers[roomId]);
            console.log(`🎯 Current room names:`, roomNames[roomId]);
            
            // Check if we're in sandbox mode
            if (roomSandboxMode[roomId]) {
              console.log(`🎯 Sandbox goal scored by Player ${scoringPlayer} in room ${roomId}`);
              // Sandbox goal - just reset ball without affecting score
              ball.pos = { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2 };
              ball.vel = { x: 0, y: 0 };
              // Stop physics loop
              clearInterval(ball.interval);
              ball.interval = null;
              // Emit sandbox goal event
              console.log(`🎯 Emitting sandbox-goal to room ${roomId}`);
              io.to(roomId).emit('sandbox-goal', { ballPos: ball.pos });
              io.to(roomId).emit('ball-move', { ballPos: ball.pos });
              return;
            } else {
              console.log(`🎯 Real goal scored by Player ${scoringPlayer} in room ${roomId}`);
              // Real goal - update score and game state
              if (!roomScores[roomId]) roomScores[roomId] = { 1: 0, 2: 0 };
              roomScores[roomId][scoringPlayer] += 1;
              console.log(`🎯 Updated score for room ${roomId}:`, roomScores[roomId]);
              
              // Check for game over
              if (roomScores[roomId][scoringPlayer] >= WINNING_SCORE) {
                // Game over
                clearInterval(ball.interval);
                ball.interval = null;
                console.log(`🎯 Game over! Winner: Player ${scoringPlayer}`);
                io.to(roomId).emit('game-over', { winner: scoringPlayer, score: roomScores[roomId], playerNames: roomNames[roomId] });
                return;
              }
              // Reset ball to center
              ball.pos = { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2 };
              ball.vel = { x: 0, y: 0 };
              // Stop physics loop
              clearInterval(ball.interval);
              ball.interval = null;
              // Next turn is the player who conceded the goal
              let nextTurn = scoringPlayer === 1 ? 2 : 1;
              roomTurns[roomId] = nextTurn;
              console.log(`🎯 Next turn set to Player ${nextTurn} for room ${roomId}`);
              
              console.log(`🎯 Emitting goal event to room ${roomId} with data:`, {
                scoringPlayer,
                score: roomScores[roomId],
                ballPos: ball.pos,
                playerNames: roomNames[roomId]
              });
              io.to(roomId).emit('goal', { scoringPlayer, score: roomScores[roomId], ballPos: ball.pos, playerNames: roomNames[roomId] });
              io.to(roomId).emit('ball-move', { ballPos: ball.pos });
              io.to(roomId).emit('turn-update', { currentTurn: nextTurn, playerNames: roomNames[roomId] });
              io.to(roomId).emit('score-update', { score: roomScores[roomId], playerNames: roomNames[roomId] });
              return;
            }
          }
          // 2. Peg collision and ricochet
          for (const peg of pegs) {
            if (circlesCollide(ball.pos, BALL_RADIUS, peg, PEG_RADIUS)) {
              // Move ball out of peg
              const toBall = vecSub(ball.pos, peg);
              const n = vecNorm(toBall);
              // Place ball just outside peg
              ball.pos.x = peg.x + n.x * (BALL_RADIUS + PEG_RADIUS + 0.1);
              ball.pos.y = peg.y + n.y * (BALL_RADIUS + PEG_RADIUS + 0.1);
              // Reflect velocity
              ball.vel = vecReflect(ball.vel, n);
              // Stronger damping for pegs
              ball.vel.x *= PEG_DAMPING;
              ball.vel.y *= PEG_DAMPING;
            }
          }
          // 3. Wall collision (left/right and non-goal top/bottom)
          if (ball.pos.x - BALL_RADIUS < 0) {
            ball.pos.x = BALL_RADIUS;
            ball.vel.x *= -1;
          }
          if (ball.pos.x + BALL_RADIUS > FIELD_WIDTH) {
            ball.pos.x = FIELD_WIDTH - BALL_RADIUS;
            ball.vel.x *= -1;
          }
          // Only bounce off top/bottom if NOT in goal area
          if (ball.pos.y - BALL_RADIUS < 0 && !(ball.pos.x > FIELD_WIDTH / 2 - 36 && ball.pos.x < FIELD_WIDTH / 2 + 36)) {
            ball.pos.y = BALL_RADIUS;
            ball.vel.y *= -1;
          }
          if (ball.pos.y + BALL_RADIUS > FIELD_HEIGHT && !(ball.pos.x > FIELD_WIDTH / 2 - 36 && ball.pos.x < FIELD_WIDTH / 2 + 36)) {
            ball.pos.y = FIELD_HEIGHT - BALL_RADIUS;
            ball.vel.y *= -1;
          }
          // Apply friction
          ball.vel.x *= FRICTION;
          ball.vel.y *= FRICTION;
          // Broadcast to all clients
          io.to(roomId).emit('ball-move', { ballPos: { x: ball.pos.x, y: ball.pos.y } });
          // Stop if velocity is very low
          if (Math.abs(ball.vel.x) < MIN_VELOCITY && Math.abs(ball.vel.y) < MIN_VELOCITY) {
            ball.vel = { x: 0, y: 0 };
            clearInterval(ball.interval);
            ball.interval = null;
            // Switch turns when ball stops
            let nextTurn = 1;
            if (roomTurns[roomId] === 1) nextTurn = 2;
            else if (roomTurns[roomId] === 2) nextTurn = 1;
            roomTurns[roomId] = nextTurn;
            io.to(roomId).emit('turn-update', { currentTurn: nextTurn, playerNames: roomNames[roomId] });
          }
        }, PHYSICS_TICK);
      }
    });
  
    socket.on('leave-room', (roomId) => {
      socket.leave(roomId);
      if (roomPlayers[roomId]) {
        console.log(`[LEAVE BEFORE] roomPlayers[${roomId}]:`, roomPlayers[roomId]);
        
        // Mark this player as disconnected with timestamp instead of immediately removing
        if (roomPlayers[roomId][0] === socket.id || roomPlayers[roomId][1] === socket.id) {
          if (!disconnectedPlayers[roomId]) {
            disconnectedPlayers[roomId] = {};
          }
          disconnectedPlayers[roomId][socket.id] = Date.now();
          console.log(`Marked socket ${socket.id} as disconnected in room ${roomId} with grace period (leave-room)`);
          
          // Schedule removal after grace period
          setTimeout(() => {
            if (disconnectedPlayers[roomId] && disconnectedPlayers[roomId][socket.id]) {
              console.log(`Grace period expired for socket ${socket.id} in room ${roomId}, removing from room (leave-room)`);
              delete disconnectedPlayers[roomId][socket.id];
              
              // Now actually remove the player from the room
              if (roomPlayers[roomId][0] === socket.id) roomPlayers[roomId][0] = null;
              if (roomPlayers[roomId][1] === socket.id) roomPlayers[roomId][1] = null;
              roomPlayers[roomId] = [roomPlayers[roomId][0] || null, roomPlayers[roomId][1] || null];
              roomPlayers[roomId].length = 2;
              
              // Check if we're back to one player (re-enter sandbox mode)
              if ((roomPlayers[roomId][0] && !roomPlayers[roomId][1]) || (!roomPlayers[roomId][0] && roomPlayers[roomId][1])) {
                roomSandboxMode[roomId] = true;
                console.log(`Re-entering sandbox mode for room ${roomId} after grace period (leave-room)`);
              }
              
              if (!roomPlayers[roomId][0] && !roomPlayers[roomId][1]) {
                delete roomPlayers[roomId];
                delete roomTurns[roomId];
                delete roomNames[roomId];
                delete roomSandboxMode[roomId];
                delete disconnectedPlayers[roomId];
              }
            }
          }, DISCONNECT_GRACE_PERIOD);
        }
      }
      console.log(`Socket ${socket.id} left room ${roomId}`);
    });

    socket.on('goal', ({ roomId, scoringPlayer }) => {
      // Reset ball and velocity, stop physics loop
      if (roomBall[roomId]) {
        roomBall[roomId].pos = { x: 210, y: 350 };
        roomBall[roomId].vel = { x: 0, y: 0 };
        if (roomBall[roomId].interval) {
          clearInterval(roomBall[roomId].interval);
          roomBall[roomId].interval = null;
        }
        io.to(roomId).emit('ball-move', { ballPos: roomBall[roomId].pos });
      }
    });
  
    socket.on('restart-game', (roomId) => {
      roomScores[roomId] = { 1: 0, 2: 0 };
      roomBall[roomId] = {
        pos: { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2 },
        vel: { x: 0, y: 0 },
        interval: null,
      };
      roomTurns[roomId] = 1;
      io.to(roomId).emit('score-update', { score: roomScores[roomId], playerNames: roomNames[roomId] });
      io.to(roomId).emit('ball-move', { ballPos: roomBall[roomId].pos });
      io.to(roomId).emit('turn-update', { currentTurn: 1, playerNames: roomNames[roomId] });
      io.to(roomId).emit('game-restarted');
    });
  
    socket.on('disconnect', () => {
      for (const roomId in roomPlayers) {
        console.log(`[DISCONNECT BEFORE] roomPlayers[${roomId}]:`, roomPlayers[roomId]);
        
        // Mark this player as disconnected with timestamp instead of immediately removing
        if (roomPlayers[roomId][0] === socket.id || roomPlayers[roomId][1] === socket.id) {
          if (!disconnectedPlayers[roomId]) {
            disconnectedPlayers[roomId] = {};
          }
          disconnectedPlayers[roomId][socket.id] = Date.now();
          console.log(`Marked socket ${socket.id} as disconnected in room ${roomId} with grace period`);
          
          // Schedule removal after grace period
          setTimeout(() => {
            if (disconnectedPlayers[roomId] && disconnectedPlayers[roomId][socket.id]) {
              console.log(`Grace period expired for socket ${socket.id} in room ${roomId}, removing from room`);
              delete disconnectedPlayers[roomId][socket.id];
              
              // Now actually remove the player from the room
              if (roomPlayers[roomId][0] === socket.id) roomPlayers[roomId][0] = null;
              if (roomPlayers[roomId][1] === socket.id) roomPlayers[roomId][1] = null;
              roomPlayers[roomId] = [roomPlayers[roomId][0] || null, roomPlayers[roomId][1] || null];
              roomPlayers[roomId].length = 2;
              
              // Check if we're back to one player (re-enter sandbox mode)
              if ((roomPlayers[roomId][0] && !roomPlayers[roomId][1]) || (!roomPlayers[roomId][0] && roomPlayers[roomId][1])) {
                roomSandboxMode[roomId] = true;
                console.log(`Re-entering sandbox mode for room ${roomId} after grace period`);
              }
              
              if (!roomPlayers[roomId][0] && !roomPlayers[roomId][1]) {
                delete roomPlayers[roomId];
                delete roomTurns[roomId];
                delete roomNames[roomId];
                delete roomSandboxMode[roomId];
                delete disconnectedPlayers[roomId];
              }
            }
          }, DISCONNECT_GRACE_PERIOD);
        }
      }
      console.log('user disconnected:', socket.id);
    });
  });
  

const PORT = process.env.PORT || 3000;

// Add error handling for server startup
server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
});

// Utility to generate a 4-character alphanumeric code
function generateRoomCode(existingRooms) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (existingRooms.has(code));
  return code;
}

// Track active room codes
const activeRooms = new Set();

// Cleanup function for expired disconnected players
function cleanupDisconnectedPlayers() {
  const now = Date.now();
  for (const roomId in disconnectedPlayers) {
    for (const socketId in disconnectedPlayers[roomId]) {
      if (now - disconnectedPlayers[roomId][socketId] > DISCONNECT_GRACE_PERIOD) {
        console.log(`Cleaning up expired disconnected player ${socketId} from room ${roomId}`);
        delete disconnectedPlayers[roomId][socketId];
        
        // Remove from room if still present
        if (roomPlayers[roomId]) {
          if (roomPlayers[roomId][0] === socketId) roomPlayers[roomId][0] = null;
          if (roomPlayers[roomId][1] === socketId) roomPlayers[roomId][1] = null;
          roomPlayers[roomId] = [roomPlayers[roomId][0] || null, roomPlayers[roomId][1] || null];
          roomPlayers[roomId].length = 2;
        }
      }
    }
    
    // Clean up empty disconnected players object
    if (Object.keys(disconnectedPlayers[roomId]).length === 0) {
      delete disconnectedPlayers[roomId];
    }
  }
}

// Run cleanup every 10 seconds
setInterval(cleanupDisconnectedPlayers, 10000);

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeRooms: activeRooms.size,
    roomPlayers: Object.keys(roomPlayers).length,
    disconnectedPlayers: Object.keys(disconnectedPlayers).length
  });
});

app.get('/api/create-room', (req, res) => {
  const roomId = generateRoomCode(activeRooms);
  activeRooms.add(roomId);
  res.json({ roomId });
});

app.get('/api/room-status/:roomId', (req, res) => {
  const { roomId } = req.params;
  const roomData = {
    roomId,
    players: roomPlayers[roomId] || null,
    names: roomNames[roomId] || null,
    turns: roomTurns[roomId] || null,
    sandboxMode: roomSandboxMode[roomId] || null,
    disconnectedPlayers: disconnectedPlayers[roomId] || null,
    ball: roomBall[roomId] || null,
    scores: roomScores[roomId] || null
  };
  res.json(roomData);
});
