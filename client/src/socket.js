// src/socket.js
import { io } from "socket.io-client";

// Use environment variable for backend URL if available
const envBackendUrl = import.meta.env.VITE_BACKEND_URL;
const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const backendUrl = envBackendUrl
  ? envBackendUrl
  : isLocal
  ? "http://localhost:3001"
  : "https://binho-production.up.railway.app";
const socket = io(backendUrl);

console.log('Socket connecting to:', backendUrl);

console.log('VITE_BACKEND_URL:', import.meta.env.VITE_BACKEND_URL);

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
