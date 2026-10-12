import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// No StrictMode: its double-invoked effects make drei's <Html> unmount label roots mid-render.
createRoot(document.getElementById('root')!).render(<App />);
