import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/logo.jpg";
import { invoke } from "@/lib/invoke";

export default function Auth() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) { toast.error("Введите имя пользователя и пароль"); return; }

    setIsLoading(true);
    try {
      const { data: cleaningData } = await invoke('cleaning-auth', {
        body: { username: username.trim(), password }
      });

      if (cleaningData?.user) {
        sessionStorage.setItem('authenticated', 'true');
        sessionStorage.setItem('cleaning_user', JSON.stringify(cleaningData.user));
        sessionStorage.setItem('cleaning_authenticated', 'true');
        toast.success(`Добро пожаловать, ${cleaningData.user.full_name}!`);
        navigate("/");
      } else {
        toast.error("Неверное имя пользователя или пароль");
        setPassword("");
      }
    } catch (error) {
      console.error('Authentication error:', error);
      toast.error("Ошибка при входе");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, hsl(175 60% 15%) 0%, hsl(160 50% 22%) 30%, hsl(150 45% 28%) 60%, hsl(165 55% 18%) 100%)",
      }}
    >
      {/* Decorative blurred orbs */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, hsl(160 60% 50%), transparent)" }} />
      <div className="absolute bottom-[-15%] left-[-10%] w-[400px] h-[400px] rounded-full opacity-15"
        style={{ background: "radial-gradient(circle, hsl(200 50% 40%), transparent)" }} />

      <div className="w-full max-w-md relative z-10">
        <div
          className="rounded-2xl p-8 shadow-2xl border border-white/10"
          style={{
            background: "rgba(255, 255, 255, 0.08)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 shadow-lg">
              <img src={logo} alt="ERA Logo" className="h-14 object-contain" />
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white tracking-tight">ERA Apartments</h1>
            <p className="text-white/50 text-sm mt-1">Управление апартаментами</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-white/60 text-xs font-medium pl-1">Имя пользователя</label>
              <Input
                type="text"
                placeholder="Георгий, Ирина, Emmochka…"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                className="bg-white/90 border-white/30 rounded-xl h-12 text-gray-800 placeholder:text-gray-400 focus-visible:ring-emerald-400/50 focus-visible:border-emerald-400/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-white/60 text-xs font-medium pl-1">Пароль</label>
              <Input
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoFocus={!username}
                className="bg-white/90 border-white/30 rounded-xl h-12 text-gray-800 placeholder:text-gray-400 focus-visible:ring-emerald-400/50 focus-visible:border-emerald-400/50"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-base font-semibold text-white shadow-lg transition-all duration-300 hover:shadow-emerald-500/25 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, hsl(160 60% 40%), hsl(175 55% 35%))",
              }}
              disabled={isLoading}
            >
              {isLoading ? "Вход..." : "Войти"}
            </Button>
          </form>

          {/* Subtle footer */}
          <p className="text-center text-white/20 text-[10px] mt-6 tracking-wider uppercase">
            ERA Deluxe · Oasis · Salvador
          </p>
        </div>
      </div>
    </div>
  );
}
