import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, AppBoundary } from './App';
import { DjangoApi } from './api/client';
import './styles/tokens.css';
import './styles/components.css';

const root = document.getElementById('root');
if (!root) throw new Error('The Django page shell is missing the workspace root.');
const api = new DjangoApi();
createRoot(root).render(<StrictMode><AppBoundary><App api={api} /></AppBoundary></StrictMode>);
