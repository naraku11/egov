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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css'; // Tailwind base styles and global CSS resets

/**
 * Global TanStack Query client.
 *
 * defaults:
 *  - staleTime 60 s   — data is "fresh" for a minute; no refetch on every mount.
 *  - gcTime 5 min     — keep unused cache entries for 5 minutes.
 *  - refetchOnWindowFocus true  — refetch when the user returns to the tab
 *                                 (covers the Page Visibility requirement).
 *  - refetchOnReconnect true    — refetch when the browser comes back online.
 *  - retry 1          — one automatic retry on transient errors.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:           60_000,
      gcTime:              5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect:   true,
      retry:               1,
    },
  },
});

// Signal to the HTML fallback timer that the JS bundle loaded successfully
window.__egov_loaded = true;

// Bootstrap the React application inside a StrictMode boundary.
// StrictMode activates additional runtime warnings during development (double-invoked
// effects, deprecated API detection, etc.) without affecting the production build.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
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
    </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
);
