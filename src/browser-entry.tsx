import React from 'react';
import { createRoot } from 'react-dom/client';
import './browser.css';
import { ProjectBrowser } from '@app/ui/ProjectBrowser/ProjectBrowser';

const root = createRoot(document.getElementById('browser-root')!);
root.render(<ProjectBrowser />);
