/**
 * main.jsx
 *
 * Application entry point. Mounts the React component tree into the DOM element
 * with id "root" (defined in index.html). Also renders the global toast notification
 * container so any component in the tree can trigger user-facing alerts via
 * react-hot-toast without needing to place <Toaster /> themselves.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import './index.css'; // Tailwind base styles and global CSS resets

// Bootstrap the React application inside a StrictMode boundary.
// StrictMode activates additional runtime warnings during development (double-invoked
// effects, deprecated API detection, etc.) without affecting the production build.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Root component: sets up routing, context providers, and page layout */}
    <App />

    {/*
     * Global toast notification container — positioned at the top-right corner.
     * All toasts auto-dismiss after 4 seconds. Success/error icons use the
     * project's primary green and red palette colours respectively.
     */}
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,                                           // ms before auto-dismiss
        style: { borderRadius: '8px', fontSize: '14px' },        // consistent card styling
        success: { iconTheme: { primary: '#16a34a', secondary: '#fff' } }, // green check
        error:   { iconTheme: { primary: '#dc2626', secondary: '#fff' } }, // red X
      }}
    />
  </React.StrictMode>
);
