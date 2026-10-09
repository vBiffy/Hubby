import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { api } from './adapters/api.js';
import './styles.css';

// Browser composition root: mount the application with its HTTP adapter.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App repository={api} />
  </React.StrictMode>,
);
