import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { wakeApi } from './api.js';
import { ProfileViewerProvider } from './components/ProfileViewer.jsx';
import { ToastProvider } from './components/ui.jsx';
import './styles.css';

wakeApi();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <ProfileViewerProvider>
        <App />
      </ProfileViewerProvider>
    </ToastProvider>
  </StrictMode>,
);
