import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { prefetchAll } from './api';

export default function App() {
  useEffect(() => {
    prefetchAll();
  }, []);
  return <Outlet />;
}
