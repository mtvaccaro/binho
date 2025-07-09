// src/socket.js
import { io } from "socket.io-client";

// Connect to your backend server (adjust URL/port if needed)
const socket = io("http://localhost:3001");

export default socket;
