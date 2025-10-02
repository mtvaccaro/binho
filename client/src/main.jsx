import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import App from './App.jsx';
import Game from './game.jsx';
import './index.css';
import './App.css';

// Initialize PostHog
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
  });
} else {
  console.warn('PostHog key not found. Set VITE_POSTHOG_KEY to enable analytics.');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PostHogProvider client={posthog}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/play/:roomId" element={<Game />} />
        </Routes>
      </BrowserRouter>
    </PostHogProvider>
  </React.StrictMode>
);
