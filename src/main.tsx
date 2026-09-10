import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { registerWeatherWebMCP } from './mcp-app';

// Initialize WebMCP Tri-Mount Registry
registerWeatherWebMCP();

// Set build info for freshness verification gates
if (typeof window !== 'undefined') {
  window.__APP_BUILD_INFO__ = {
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
    commit: typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'prod',
    buildTime: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString(),
    monastery: 'weather-stats',
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
