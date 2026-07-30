import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import { NavStyleProvider } from '@/lib/navStyle';
import { TooltipProvider, Toaster } from '@/components/ui';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import App from '@/App';
import '@/styles/tailwind.css';
import '@/styles/report-workspace.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      {/* Beside the theme: both are per-browser display preferences the shell
          reads, so they wrap it together. */}
      <NavStyleProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <TooltipProvider delayDuration={200}>
                <App />
                <Toaster />
                {/* Renders nothing; owns the service worker and raises the
                    "new version available" toast. Inside <Toaster />'s tree so
                    the toast it fires has a host to land in. */}
                <UpdatePrompt />
              </TooltipProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </NavStyleProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
