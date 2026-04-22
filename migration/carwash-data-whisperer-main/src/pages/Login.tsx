import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Fingerprint, KeyRound, LogIn, Mail, RefreshCw, Shield, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/api";
import { loginNewSystem, verify2FA, resend2FA, authenticateWithBiometric, isBiometricSupported, getDeviceName } from "@/lib/userApi";
import { supabase } from "@/integrations/supabase/client";
import carwashDay from "@/assets/carwash-day.jpg";
import eraLogo from "@/assets/era-logo.jpg";

async function writeLoginLog(username: string, status: 'success' | 'failed' | 'biometric_error', errorMessage?: string) {
  try {
    await supabase.from('login_logs').insert({
      username,
      status,
      user_agent: navigator.userAgent,
      device_name: getDeviceName(),
      error_message: errorMessage || null,
    });
  } catch { /* silent */ }
}

type Step = 'credentials' | '2fa' | 'email_verify';

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('credentials');
  const [twoFaCode, setTwoFaCode] = useState("");
  const [userId, setUserId] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setBiometricAvailable(isBiometricSupported());
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  const saveSession = (data: { token: string; username: string; role?: string; fullName?: string; userId?: string }) => {
    localStorage.setItem('carwash_token', data.token);
    // Generate legacy token in btoa("username:timestamp") format for scrape-carwash
    localStorage.setItem('carwash_legacy_token', btoa(`${data.username}:${Date.now()}`));
    localStorage.setItem('carwash_user', data.username);
    localStorage.setItem('carwash_role', data.role || 'user');
    if (data.fullName) localStorage.setItem('carwash_full_name', data.fullName);
    if (data.userId) localStorage.setItem('carwash_user_id', data.userId);
    writeLoginLog(data.username, 'success');
    window.dispatchEvent(new Event('auth-changed'));
    navigate("/");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Try new system first
      const result = await loginNewSystem(username, password);
      if (result.success) {
        if (result.requires2FA || result.requiresEmailVerify) {
          setUserId(result.userId);
          setMaskedEmail(result.email || '');
          setStep(result.requiresEmailVerify ? 'email_verify' : '2fa');
          setResendCooldown(60);
        } else {
          saveSession(result);
        }
      } else {
        // Fallback to old system
        const oldResult = await login(username, password);
        if (oldResult.success) {
          localStorage.setItem('carwash_role', username === 'georgen77' ? 'admin' : 'user');
          writeLoginLog(username, 'success');
          window.dispatchEvent(new Event('auth-changed'));
          navigate("/");
        } else {
          writeLoginLog(username, 'failed', result.error || oldResult.error);
          setError(result.error || oldResult.error || "Помилка входу");
        }
      }
    } catch (err) {
      // Fallback to old system on new system error
      try {
        const oldResult = await login(username, password);
        if (oldResult.success) {
          localStorage.setItem('carwash_role', username === 'georgen77' ? 'admin' : 'user');
          writeLoginLog(username, 'success');
          window.dispatchEvent(new Event('auth-changed'));
          navigate("/");
        } else {
          writeLoginLog(username, 'failed', oldResult.error);
          setError(oldResult.error || "Помилка входу");
        }
      } catch (err2) {
        writeLoginLog(username, 'failed', (err2 as Error).message);
        setError((err2 as Error).message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await verify2FA(userId, twoFaCode);
      if (result.success) {
        saveSession(result);
      } else {
        setError(result.error || "Невірний код");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await resend2FA(userId);
      setResendCooldown(60);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleBiometric = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authenticateWithBiometric();
      if (result.success && result.token) {
        writeLoginLog(result.username || '', 'success');
        saveSession(result as { token: string; username: string; role?: string; fullName?: string });
      } else {
        const errMsg = result.error || "Біометрична аутентифікація не вдалась";
        writeLoginLog(username || 'unknown', 'biometric_error', errMsg);
        if (errMsg === 'Biometric not registered') {
          setError("Біометрія не зареєстрована. Увійдіть через логін/пароль та зареєструйте відбиток у профілі.");
        } else {
          setError(errMsg);
        }
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      writeLoginLog(username || 'unknown', 'biometric_error', errMsg);
      const isNotAllowed = errMsg.includes('timed out') || errMsg.includes('NotAllowedError') || errMsg.includes('not allowed');
      setError(isNotAllowed
        ? "Аутентифікацію скасовано або перевищено час очікування. Спробуйте ще раз."
        : errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${carwashDay})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70 backdrop-blur-[2px]" />

      <Card className="relative w-full max-w-sm border-0 shadow-2xl overflow-hidden bg-transparent">
        {/* Glass card */}
        <div className="absolute inset-0 bg-card/80 backdrop-blur-xl rounded-2xl border border-white/10" />
        
        <CardHeader className="relative text-center pb-4 pt-8">
          {/* Logo */}
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl overflow-hidden shadow-xl shadow-gold/30 ring-2 ring-gold/40">
            <img src={eraLogo} alt="ERA" className="h-full w-full object-cover" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">ERA Автомийки</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {step === 'credentials' ? 'Увійдіть для доступу до системи' : 
             step === '2fa' ? 'Двофакторна аутентифікація' :
             'Підтвердження Email'}
          </p>
        </CardHeader>

        <CardContent className="relative pb-8 space-y-4">
          {/* Step: Credentials */}
          {step === 'credentials' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Логін</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  className="bg-background/50 border-white/10 focus:border-gold/50 h-11 text-base"
                  placeholder="Введіть логін"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Пароль</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-background/50 border-white/10 focus:border-gold/50 h-11 text-base pr-10"
                    placeholder="Введіть пароль"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  <Shield className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-11 gap-2 bg-gold hover:bg-gold/90 text-gold-foreground font-semibold text-base shadow-lg shadow-gold/20" disabled={loading}>
                <LogIn className="h-4 w-4" />
                {loading ? "Вхід..." : "Увійти"}
              </Button>

              {biometricAvailable && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 gap-2 border-white/10 bg-background/30 hover:bg-background/50 text-sm"
                  onClick={handleBiometric}
                  disabled={loading}
                >
                  <Fingerprint className="h-5 w-5 text-gold" />
                  Увійти через Face ID / Fingerprint
                </Button>
              )}
            </form>
          )}

          {/* Step: 2FA */}
          {(step === '2fa' || step === 'email_verify') && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="h-12 w-12 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-gold" />
                </div>
                <p className="text-sm text-center text-muted-foreground">
                  Код надіслано на <span className="text-foreground font-medium">{maskedEmail}</span>
                </p>
              </div>

              <form onSubmit={handle2FASubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="code" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {step === 'email_verify' ? 'Код підтвердження Email' : 'Код 2FA'}
                  </Label>
                  {/* OTP-style input */}
                  <Input
                    id="code"
                    value={twoFaCode}
                    onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    autoFocus
                    className="bg-background/50 border-white/10 focus:border-gold/50 h-14 text-center text-2xl tracking-[0.5em] font-bold"
                    placeholder="• • • • • •"
                    maxLength={6}
                    inputMode="numeric"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                    <Shield className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 gap-2 bg-gold hover:bg-gold/90 text-gold-foreground font-semibold text-base shadow-lg shadow-gold/20"
                  disabled={loading || twoFaCode.length < 6}
                >
                  <KeyRound className="h-4 w-4" />
                  {loading ? "Перевірка..." : "Підтвердити"}
                </Button>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { setStep('credentials'); setError(''); setTwoFaCode(''); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Назад
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0}
                    className="text-xs text-muted-foreground hover:text-gold transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {resendCooldown > 0 ? `Повторити через ${resendCooldown}с` : 'Надіслати ще раз'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
