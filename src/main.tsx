import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadActiveRegion } from './data/region';
import './index.css';

const root = createRoot(document.getElementById('root')!);

try {
  await loadActiveRegion();
  // No StrictMode: its double-invoked effects make drei's <Html> unmount label roots mid-render.
  root.render(<App />);
} catch (err) {
  root.render(
    <p role="alert" style={{ padding: 24 }}>
      The map didn't load: {err instanceof Error ? err.message : String(err)}
    </p>,
  );
}
