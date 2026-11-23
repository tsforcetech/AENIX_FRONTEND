import { Outlet } from '@tanstack/react-router';
import { SkipLink } from '@/shared/ui/SkipLink';
import { ToastProvider } from '@/shared/ui/Toast';

export function RootLayout() {
  return (
    <ToastProvider>
      <SkipLink targetId="main-content" />
      <div className="min-h-dvh bg-canvas text-fg">
        <Outlet />
      </div>
    </ToastProvider>
  );
}
