// src/socket.js
import { io } from "socket.io-client";

// Connect to your backend server (production)
const socket = io("https://binho-production.up.railway.app");

export default socket;
