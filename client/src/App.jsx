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
      // Use environment variable for backend URL if available
      const envBackendUrl = import.meta.env.VITE_BACKEND_URL;
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const apiBase = envBackendUrl
        ? envBackendUrl
        : isLocal
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
    <div className="home-bg">
      <div className="home-overlay">
        <div className="home-content">
          <h1 className="home-title">Biñho</h1>
          <button className="home-btn" onClick={handleCreateGame} disabled={loading}>
            {loading ? 'Creating Game...' : 'Start Game'}
      </button>
        </div>
      </div>
    </div>
  );
}

export default App;

