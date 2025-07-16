import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import socket from './socket';

function App() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    socket.on('connect', () => {
      console.log('✅ Connected to server. Socket ID:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
    });

    // Cleanup listeners on unmount
    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  const handleCreateGame = async () => {
    setLoading(true);
    try {
      // Use Railway backend in production, localhost in development
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const apiBase = isLocal
        ? 'http://localhost:3001'
        : 'https://binho-production.up.railway.app';
      const res = await fetch(`${apiBase}/api/create-room`);
      const data = await res.json();
      if (data.roomId) {
        navigate(`/play/${data.roomId}`);
      } else {
        alert('Failed to create room.');
      }
    } catch (err) {
      alert('Error creating room.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Biñho</h1>
      <p>Check your browser console to confirm the socket is connected.</p>
      <button onClick={handleCreateGame} disabled={loading} style={{ marginTop: '2rem', fontSize: '1.2em' }}>
        {loading ? 'Creating Game...' : 'Create Game'}
      </button>
    </div>
  );
}

export default App;

