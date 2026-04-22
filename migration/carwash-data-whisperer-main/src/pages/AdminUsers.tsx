import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Pencil, Trash2, Shield, Mail, Phone, User, Key,
  Fingerprint, CheckCircle2,
  ChevronLeft, Eye, EyeOff, AlertTriangle, Smartphone, Clock, LogIn
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listUsers, createUser, updateUser, deleteUser, listCredentials, deleteCredential } from "@/lib/userApi";
import { isAdminUser } from "@/lib/userApi";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface AppUser {
  id: string;
  username: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  is_active: boolean;
  two_fa_enabled: boolean;
  two_fa_required_each_login: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  email_verify_required: boolean;
  phone_verify_required: boolean;
  biometrics_enabled: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface WebAuthnCredential {
  id: string;
  credential_id: string;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
}

interface LoginLog {
  id: string;
  logged_at: string;
  status: string;
  device_name: string | null;
  user_agent: string | null;
  error_message: string | null;
}

const emptyForm = {
  username: '', password: '', full_name: '', email: '', phone: '', role: 'user',
  two_fa_enabled: false, two_fa_required_each_login: false,
  email_verify_required: false, phone_verify_required: false, is_active: true,
};

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<AppUser | null>(null);
  const [credentialsUser, setCredentialsUser] = useState<AppUser | null>(null);
  const [credentials, setCredentials] = useState<WebAuthnCredential[]>([]);
  const [logsUser, setLogsUser] = useState<AppUser | null>(null);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);

  useEffect(() => {
    if (!isAdminUser()) {
      navigate('/');
      return;
    }
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listUsers();
      if (res.success) setUsers(res.users || []);
      else setError(res.error || 'Помилка завантаження');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditUser(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEdit = (user: AppUser) => {
    setEditUser(user);
    setForm({
      username: user.username,
      password: '',
      full_name: user.full_name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role,
      two_fa_enabled: user.two_fa_enabled,
      two_fa_required_each_login: user.two_fa_required_each_login,
      email_verify_required: user.email_verify_required,
      phone_verify_required: user.phone_verify_required,
      is_active: user.is_active,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (editUser) {
        const updates: Record<string, unknown> = { ...form };
        if (!updates.password) delete updates.password;
        delete updates.username;
        await updateUser(editUser.id, updates);
      } else {
        if (!form.password) { setError('Пароль обов\'язковий'); return; }
        await createUser(form);
      }
      setShowForm(false);
      await loadUsers();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteUser(deleteConfirm.id);
      setDeleteConfirm(null);
      await loadUsers();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openCredentials = async (user: AppUser) => {
    setCredentialsUser(user);
    try {
      const res = await listCredentials(user.id);
      setCredentials(res.credentials || []);
    } catch { setCredentials([]); }
  };

  const handleDeleteCredential = async (credId: string) => {
    await deleteCredential(credId);
    if (credentialsUser) {
      const res = await listCredentials(credentialsUser.id);
      setCredentials(res.credentials || []);
    }
  };

  const openLoginLogs = async (user: AppUser) => {
    setLogsUser(user);
    try {
      const { data } = await supabase
        .from('login_logs')
        .select('id, logged_at, status, device_name, user_agent, error_message')
        .eq('username', user.username)
        .order('logged_at', { ascending: false })
        .limit(30);
      setLoginLogs(data || []);
    } catch { setLoginLogs([]); }
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-9 w-9 shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
              <Shield className="h-4 w-4 text-gold" />
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight">Управління доступом</h1>
              <p className="text-[10px] text-muted-foreground">Адміністратор · {users.length} користувачів</p>
            </div>
          </div>
          <Button size="sm" onClick={openCreate} className="bg-gold hover:bg-gold/90 text-gold-foreground gap-1.5 h-9 shrink-0">
            <Plus className="h-3.5 w-3.5" />
            Додати
          </Button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3 max-w-2xl mx-auto">
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3 border border-destructive/20">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-24 rounded-2xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : users.map(user => (
          <UserCard
            key={user.id}
            user={user}
            onEdit={() => openEdit(user)}
            onDelete={() => setDeleteConfirm(user)}
            onCredentials={() => openCredentials(user)}
            onLogs={() => openLoginLogs(user)}
            formatDate={formatDate}
          />
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gold/10 flex items-center justify-center">
                {editUser ? <Pencil className="h-4 w-4 text-gold" /> : <Plus className="h-4 w-4 text-gold" />}
              </div>
              {editUser ? 'Редагувати користувача' : 'Новий користувач'}
            </DialogTitle>
          </DialogHeader>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Section title="Особисті дані" icon={<User className="h-3.5 w-3.5" />}>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="field-label">ПІБ</Label>
                  <Input placeholder="Прізвище Ім'я По-батькові" value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
                </div>
                <div>
                  <Label className="field-label">Логін *</Label>
                  <Input placeholder="username" value={form.username} required
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    disabled={!!editUser} />
                </div>
                <div>
                  <Label className="field-label">{editUser ? 'Новий пароль' : 'Пароль *'}</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={editUser ? 'Залишити незмінним' : 'Мінімум 6 символів'}
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      required={!editUser}
                      className="pr-9"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Контакти" icon={<Mail className="h-3.5 w-3.5" />}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="field-label">Email</Label>
                  <Input type="email" placeholder="user@example.com" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <Label className="field-label">Телефон</Label>
                  <Input placeholder="+380..." value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
            </Section>

            <Section title="Доступ та роль" icon={<Shield className="h-3.5 w-3.5" />}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 items-center">
                  <div>
                    <Label className="field-label">Роль</Label>
                    <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Адміністратор</SelectItem>
                        <SelectItem value="manager">Менеджер</SelectItem>
                        <SelectItem value="user">Користувач</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="pt-5">
                    <ToggleRow label="Активний" value={form.is_active} onChange={v => setForm(f => ({ ...f, is_active: v }))} />
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Підтвердження при першому вході" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
              <div className="space-y-2.5">
                <ToggleRow
                  label="Підтвердити Email при першому вході"
                  value={form.email_verify_required}
                  onChange={v => setForm(f => ({ ...f, email_verify_required: v }))}
                  disabled={!form.email}
                />
                <ToggleRow
                  label="Підтвердити телефон при першому вході"
                  value={form.phone_verify_required}
                  onChange={v => setForm(f => ({ ...f, phone_verify_required: v }))}
                  disabled={!form.phone}
                />
              </div>
            </Section>

            <Section title="Двофакторна автентифікація (2FA)" icon={<Key className="h-3.5 w-3.5" />}>
              <div className="space-y-2.5">
                <ToggleRow
                  label="Увімкнути 2FA"
                  description="Код підтвердження при вході"
                  value={form.two_fa_enabled}
                  onChange={v => setForm(f => ({ ...f, two_fa_enabled: v }))}
                  disabled={!form.email}
                />
                {form.two_fa_enabled && (
                  <ToggleRow
                    label="2FA при кожному вході"
                    description="Запитувати код щоразу (не тільки перший раз)"
                    value={form.two_fa_required_each_login}
                    onChange={v => setForm(f => ({ ...f, two_fa_required_each_login: v }))}
                  />
                )}
              </div>
            </Section>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Скасувати</Button>
              <Button type="submit" className="flex-1 bg-gold hover:bg-gold/90 text-gold-foreground" disabled={submitting}>
                {submitting ? 'Збереження...' : editUser ? 'Зберегти' : 'Створити'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Видалити користувача?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Ви впевнені, що хочете видалити <span className="font-semibold text-foreground">{deleteConfirm?.username}</span>? Ця дія незворотня.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>Скасувати</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDelete}>Видалити</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Credentials Dialog */}
      <Dialog open={!!credentialsUser} onOpenChange={() => setCredentialsUser(null)}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-gold" />
              Biometric-пристрої
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{credentialsUser?.username}</p>
          {credentials.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Smartphone className="h-10 w-10 mx-auto mb-2 opacity-30" />
              Немає зареєстрованих пристроїв
            </div>
          ) : (
            <div className="space-y-2">
              {credentials.map(cred => (
                <div key={cred.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/50">
                  <Fingerprint className="h-4 w-4 text-gold shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cred.device_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Додано: {formatDate(cred.created_at)}
                      {cred.last_used_at && ` · Востаннє: ${formatDate(cred.last_used_at)}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteCredential(cred.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Login Logs Dialog */}
      <Dialog open={!!logsUser} onOpenChange={() => setLogsUser(null)}>
        <DialogContent className="max-w-sm mx-4 max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-gold" />
              Логи входів
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">@{logsUser?.username}</p>
          <div className="flex-1 overflow-y-auto space-y-2 mt-2">
            {loginLogs.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <LogIn className="h-10 w-10 mx-auto mb-2 opacity-30" />
                Немає записів
              </div>
            ) : loginLogs.map(log => (
              <div key={log.id} className={cn(
                "flex items-start gap-2.5 p-2.5 rounded-xl border text-xs",
                log.status === 'success' ? 'bg-primary/5 border-primary/20' : 'bg-destructive/5 border-destructive/20'
              )}>
                <div className={cn(
                  "h-2 w-2 rounded-full mt-1 shrink-0",
                  log.status === 'success' ? 'bg-primary' : 'bg-destructive'
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("font-semibold", log.status === 'success' ? 'text-primary' : 'text-destructive')}>
                      {log.status === 'success' ? 'Успішно' : log.status === 'biometric_error' ? 'Biometric' : 'Помилка'}
                    </span>
                    <span className="text-muted-foreground text-[10px]">{formatDate(log.logged_at)}</span>
                  </div>
                  {log.device_name && <p className="text-muted-foreground mt-0.5">{log.device_name}</p>}
                  {log.error_message && <p className="text-destructive/80 mt-0.5 text-[10px]">{log.error_message}</p>}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserCard({ user, onEdit, onDelete, onCredentials, onLogs, formatDate }: {
  user: AppUser; onEdit: () => void; onDelete: () => void; onCredentials: () => void; onLogs: () => void; formatDate: (d: string | null) => string;
}) {
  const roleColors: Record<string, string> = {
    admin: 'bg-gold/15 text-gold border-gold/30',
    manager: 'bg-primary/15 text-primary border-primary/30',
    user: 'bg-muted text-muted-foreground border-border',
  };
  const roleLabels: Record<string, string> = { admin: 'Адмін', manager: 'Менеджер', user: 'Користувач' };

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className={cn(
            "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 text-lg font-bold",
            user.role === 'admin' ? 'bg-gold/15 text-gold' : 'bg-muted text-muted-foreground'
          )}>
            {user.full_name ? user.full_name[0].toUpperCase() : user.username[0].toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{user.full_name || user.username}</span>
              <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", roleColors[user.role] || roleColors.user)}>
                {roleLabels[user.role] || user.role}
              </Badge>
              {!user.is_active && <Badge variant="destructive" className="text-[10px] h-4 px-1.5">Заблоковано</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">@{user.username}</p>

            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
              {user.email && <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" />{user.email}
                {user.email_verified && <CheckCircle2 className="h-3 w-3 text-primary" />}
              </span>}
              {user.phone && <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />{user.phone}
              </span>}
            </div>

            {/* Security badges */}
            <div className="flex flex-wrap gap-1 mt-2">
              {user.two_fa_enabled && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                  <Shield className="h-2.5 w-2.5" />2FA
                  {user.two_fa_required_each_login && ' кожен вхід'}
                </span>
              )}
              {user.biometrics_enabled && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-secondary text-secondary-foreground border border-border rounded-full px-2 py-0.5">
                  <Fingerprint className="h-2.5 w-2.5" />Biometric
                </span>
              )}
              {user.email_verify_required && !user.email_verified && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-destructive/10 text-destructive border border-destructive/20 rounded-full px-2 py-0.5">
                  <Mail className="h-2.5 w-2.5" />Email не підтверджено
                </span>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground/60 mt-1.5 cursor-pointer hover:text-primary transition-colors" onClick={onLogs}>
              Останній вхід: {formatDate(user.last_login_at)} · <span className="underline">Логи</span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {user.biometrics_enabled && (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={onCredentials}>
                <Fingerprint className="h-3.5 w-3.5" />
              </Button>
            )}
            {user.username !== 'georgen77' && (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {icon}{title}
      </div>
      <div className="bg-muted/30 rounded-xl p-3 space-y-3">{children}</div>
    </div>
  );
}

function ToggleRow({ label, description, value, onChange, disabled }: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", disabled && "opacity-40 pointer-events-none")}>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
