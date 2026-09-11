import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';

import Layout from './components/Layout';
import NotFound from './pages/NotFound/NotFound';
import SurgeBoardPage from './pages/surge-board/SurgeBoardPage';
import LimitUpPage from './pages/limit-up/LimitUpPage';
import LimitBrokenPage from './pages/limit-broken/LimitBrokenPage';
import StockScreenerPage from './pages/stock-screener/StockScreenerPage';
import StockResearchPage from './pages/stock-research/StockResearchPage';
import StockComparePage from './pages/stock-compare/StockComparePage';
import WatchlistPage from './pages/watchlist/WatchlistPage';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/surge" replace />} />
        <Route path="surge" element={<SurgeBoardPage />} />
        <Route path="limit-up" element={<LimitUpPage />} />
        <Route path="limit-broken" element={<LimitBrokenPage />} />
        <Route path="screener" element={<StockScreenerPage />} />
        <Route path="research" element={<StockResearchPage />} />
        <Route path="compare" element={<StockComparePage />} />
        <Route path="watchlist" element={<WatchlistPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
