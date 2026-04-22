import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import AiPromptJournal from "./pages/AiPromptJournal";
import WorkJournal from "./pages/WorkJournal";
import AdminUsers from "./pages/AdminUsers";
import { isAuthenticated } from "./lib/api";
import { isAdminUser } from "./lib/userApi";
import { AppProvider } from "./lib/i18n";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  const user = localStorage.getItem('carwash_user');
  if (user !== 'georgen77') return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <AppProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/ai-journal" element={<ProtectedRoute><AiPromptJournal /></ProtectedRoute>} />
            <Route path="/work-journal" element={<ProtectedRoute><WorkJournal /></ProtectedRoute>} />
            <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppProvider>
);

export default App;
