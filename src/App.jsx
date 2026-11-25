import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import RadioStation from './pages/RadioStation';
import { ErrorBoundary } from './components/common/ErrorBoundary';

export function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          {/* Main Transceiver Studio: Dual Split View */}
          <Route path="/" element={<RadioStation defaultView="dual" />} />
          
          {/* Dedicated Transmitter Node (for field / ASHA laptop) */}
          <Route path="/tx" element={<RadioStation defaultView="tx" />} />
          
          {/* Dedicated Receiver Node (for gateway / doctor laptop) */}
          <Route path="/rx" element={<RadioStation defaultView="rx" />} />
          
          {/* Catch-all redirect to main transceiver */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
