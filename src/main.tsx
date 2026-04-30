import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import './styles.css';
import App from './App';
import Overview from './pages/Overview';
import Indices from './pages/Indices';
import Rates from './pages/Rates';
import Commodities from './pages/Commodities';
import FX from './pages/FX';
import Crypto from './pages/Crypto';
import Sentiment from './pages/Sentiment';
import Macro from './pages/Macro';
import Calendar from './pages/Calendar';
import Health from './pages/Health';

const container = document.getElementById('root');
if (!container) throw new Error('#root missing');

createRoot(container).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Overview />} />
          <Route path="indices" element={<Indices />} />
          <Route path="rates" element={<Rates />} />
          <Route path="commodities" element={<Commodities />} />
          <Route path="fx" element={<FX />} />
          <Route path="crypto" element={<Crypto />} />
          <Route path="sentiment" element={<Sentiment />} />
          <Route path="macro" element={<Macro />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="health" element={<Health />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
