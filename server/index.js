const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const app = express();

// Health check route for Railway and browsers
app.get('/', (req, res) => {
  res.send('Binho backend is running!');
});

const allowedOrigins = [
  'https://binho.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  /^https:\/\/[a-zA-Z0-9-]+--binho(-[a-zA-Z0-9-]+)?--mtvaccaros-projects\.vercel\.app$/,
  /^https:\/\/[a-zA-Z0-9-]+-binho(-[a-zA-Z0-9-]+)?-mtvaccaros-projects\.vercel\.app$/,
  /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/
];

function dynamicCorsOrigin(origin, callback) {
  console.log('CORS origin:', origin);
  if (!origin) {
    console.log('CORS: No origin, allowing');
    return callback(null, true);
  }
  if (allowedOrigins.some(o => (typeof o === 'string' ? o === origin : o.test(origin)))) {
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
    origin: '*', // TEMP: allow all origins for debugging
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
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room ${roomId} with name: ${name}`);
      if (!roomPlayers[roomId]) roomPlayers[roomId] = [null, null];
      if (!roomNames[roomId]) roomNames[roomId] = { 1: '', 2: '' };
      console.log(`[BEFORE JOIN] roomPlayers[${roomId}]:`, roomPlayers[roomId]);
      console.log(`[BEFORE JOIN] roomNames[${roomId}]:`, roomNames[roomId]);
      // Remove socket ID from both slots if present
      if (roomPlayers[roomId][0] === socket.id) roomPlayers[roomId][0] = null;
      if (roomPlayers[roomId][1] === socket.id) roomPlayers[roomId][1] = null;
      // Ensure both slots are present
      roomPlayers[roomId] = [roomPlayers[roomId][0] || null, roomPlayers[roomId][1] || null];
      roomPlayers[roomId].length = 2;
      console.log(`[AFTER CLEANUP] roomPlayers[${roomId}]:`, roomPlayers[roomId]);
      // Assign to first available slot
      let assignedSlot = -1;
      if (roomPlayers[roomId][0] == null) {
        roomPlayers[roomId][0] = socket.id;
        roomNames[roomId][1] = name;
        assignedSlot = 0;
        console.log(`Assigned ${name} to slot 1 (Player 1)`);
      } else if (roomPlayers[roomId][1] == null) {
        roomPlayers[roomId][1] = socket.id;
        roomNames[roomId][2] = name;
        assignedSlot = 1;
        console.log(`Assigned ${name} to slot 2 (Player 2)`);
      } else {
        // Room full
        console.log('Room full, cannot join:', roomId);
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
            if (!roomScores[roomId]) roomScores[roomId] = { 1: 0, 2: 0 };
            roomScores[roomId][scoringPlayer] += 1;
            // Check for game over
            if (roomScores[roomId][scoringPlayer] >= WINNING_SCORE) {
              // Game over
              clearInterval(ball.interval);
              ball.interval = null;
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
            io.to(roomId).emit('goal', { scoringPlayer, score: roomScores[roomId], ballPos: ball.pos, playerNames: roomNames[roomId] });
            io.to(roomId).emit('ball-move', { ballPos: ball.pos });
            io.to(roomId).emit('turn-update', { currentTurn: nextTurn, playerNames: roomNames[roomId] });
            io.to(roomId).emit('score-update', { score: roomScores[roomId], playerNames: roomNames[roomId] });
            return;
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
        if (roomPlayers[roomId][0] === socket.id) roomPlayers[roomId][0] = null;
        if (roomPlayers[roomId][1] === socket.id) roomPlayers[roomId][1] = null;
        // Ensure both slots are present
        roomPlayers[roomId] = [roomPlayers[roomId][0] || null, roomPlayers[roomId][1] || null];
        roomPlayers[roomId].length = 2;
        console.log(`[LEAVE AFTER] roomPlayers[${roomId}]:`, roomPlayers[roomId]);
        if (!roomPlayers[roomId][0] && !roomPlayers[roomId][1]) {
          delete roomPlayers[roomId];
          delete roomTurns[roomId];
          delete roomNames[roomId];
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
        if (roomPlayers[roomId][0] === socket.id) roomPlayers[roomId][0] = null;
        if (roomPlayers[roomId][1] === socket.id) roomPlayers[roomId][1] = null;
        // Ensure both slots are present
        roomPlayers[roomId] = [roomPlayers[roomId][0] || null, roomPlayers[roomId][1] || null];
        roomPlayers[roomId].length = 2;
        console.log(`[DISCONNECT AFTER] roomPlayers[${roomId}]:`, roomPlayers[roomId]);
        if (!roomPlayers[roomId][0] && !roomPlayers[roomId][1]) {
          delete roomPlayers[roomId];
          delete roomTurns[roomId];
          delete roomNames[roomId];
        }
      }
      console.log('user disconnected:', socket.id);
    });
  });
  

const PORT = process.env.PORT || 3001;
server.listen(3000, () => {
  console.log('Server listening on port 3000');
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

app.get('/api/create-room', (req, res) => {
  const roomId = generateRoomCode(activeRooms);
  activeRooms.add(roomId);
  res.json({ roomId });
});
