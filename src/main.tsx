import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { getStoredUsers } from './utils/userStorage';
import './index.css';

// Seed the bootstrap admin (or repair a missing one) before the first render.
getStoredUsers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
