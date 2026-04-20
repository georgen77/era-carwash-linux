import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import CleaningAuth from "./pages/CleaningAuth";
import CleaningDashboard from "./pages/CleaningDashboard";
import Tasks from "./pages/Tasks";
import Cleanings from "./pages/Cleanings";
import AITraining from "./pages/AITraining";
import TelegramSettings from "./pages/TelegramSettings";
import NotFound from "./pages/NotFound";
import CleanerStats from "./pages/CleanerStats";
import ShareTarget from "./pages/ShareTarget";
import ScanLinen from "./pages/ScanLinen";
import TelegramMessages from "./pages/TelegramMessages";
import CleanerManagement from "./pages/CleanerManagement";
import AlbertLaundry from "./pages/AlbertLaundry";
import LockCodes from "./pages/LockCodes";
import GuestPortal from "./pages/GuestPortal";
import { CityThemeProvider } from "@/context/CityThemeContext";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated =
    sessionStorage.getItem('authenticated') === 'true' ||
    sessionStorage.getItem('cleaning_authenticated') === 'true';
  return isAuthenticated ? <>{children}</> : <Navigate to="/auth" replace />;
};

const CleaningProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated =
    sessionStorage.getItem('cleaning_authenticated') === 'true' ||
    sessionStorage.getItem('authenticated') === 'true';
  const hasCleaningUser = !!sessionStorage.getItem('cleaning_user');
  if (!isAuthenticated) return <Navigate to="/cleaning-auth" replace />;
  if (!hasCleaningUser) return <Navigate to="/cleaning-auth" replace />;
  return <>{children}</>;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CityThemeProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/cleaning-auth" element={<CleaningAuth />} />
            <Route path="/cleaning" element={<CleaningProtectedRoute><CleaningDashboard /></CleaningProtectedRoute>} />
            <Route path="/tasks" element={<CleaningProtectedRoute><Tasks /></CleaningProtectedRoute>} />
            <Route path="/cleanings" element={<CleaningProtectedRoute><Cleanings /></CleaningProtectedRoute>} />
            <Route path="/ai-training" element={<AITraining />} />
            <Route path="/telegram-settings" element={<TelegramSettings />} />
            <Route path="/share-target" element={<ShareTarget />} />
            <Route path="/scan-linen" element={<ScanLinen />} />
            <Route path="/telegram-messages" element={<ProtectedRoute><TelegramMessages /></ProtectedRoute>} />
            <Route path="/cleaner-stats" element={<ProtectedRoute><CleanerStats /></ProtectedRoute>} />
            <Route path="/cleaner-management" element={<CleaningProtectedRoute><CleanerManagement /></CleaningProtectedRoute>} />
            <Route path="/albert" element={<CleaningProtectedRoute><AlbertLaundry /></CleaningProtectedRoute>} />
            <Route path="/guest/:token" element={<GuestPortal />} />
            <Route path="/locks" element={<CleaningProtectedRoute><LockCodes /></CleaningProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </CityThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
