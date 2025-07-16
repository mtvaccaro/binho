// src/socket.js
import { io } from "socket.io-client";

// Connect to your backend server (production)
const socket = io("https://binho-production.up.railway.app");

// Add connection error and reconnect event listeners for debugging
socket.on('connect_error', (err) => {
  console.error('❌ Socket connection error:', err);
  if (window && window.alert) {
    window.alert('Socket connection error: ' + err.message);
  }
});

socket.on('reconnect_attempt', (attempt) => {
  console.warn('🔄 Socket reconnect attempt:', attempt);
});

socket.on('reconnect_failed', () => {
  console.error('❌ Socket reconnect failed');
  if (window && window.alert) {
    window.alert('Socket reconnect failed.');
  }
});

export default socket;
