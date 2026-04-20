import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Building2 } from "lucide-react";
import { invoke } from "@/lib/invoke";

const CleaningAuth = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      toast({
        title: "Ошибка",
        description: "Пожалуйста, заполните все поля",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await invoke('cleaning-auth', {
        body: { username, password }
      });

      if (error) throw error;

      if (data.user) {
        sessionStorage.setItem('cleaning_user', JSON.stringify(data.user));
        sessionStorage.setItem('cleaning_authenticated', 'true');
        // Also grant linen access so no re-login needed when switching sections
        sessionStorage.setItem('authenticated', 'true');
        
        toast({
          title: "Успешный вход",
          description: `Добро пожаловать, ${data.user.full_name}!`,
        });
        
        navigate('/cleaning');
      } else {
        throw new Error(data.error || 'Ошибка входа');
      }
    } catch (error: any) {
      toast({
        title: "Ошибка входа",
        description: error.message || "Неверное имя пользователя или пароль",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage: 'url(/images/interior-bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-black/50" />
      
      <Card className="w-full max-w-md relative z-10 bg-background/95 backdrop-blur">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <Building2 className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl text-center">Система уборок</CardTitle>
          <CardDescription className="text-center">
            Oasis 1, Oasis 2, Salvador
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Имя пользователя</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                placeholder="Введите имя пользователя"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                placeholder="Введите пароль"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Вход..." : "Войти"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CleaningAuth;
