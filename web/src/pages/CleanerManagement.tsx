import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Trash2, Upload, Phone, Calendar, Key, FileText, User } from "lucide-react";

interface Cleaner {
  id: string;
  name: string;
  phone: string | null;
  telegram_id: string | null;
  whatsapp_number: string | null;
  birthday: string | null;
  access_code: string | null;
  passport_url: string | null;
  emergency_contact: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  available_days: string[] | null;
  created_at: string;
}

const emptyForm = {
  name: "", phone: "", telegram_id: "", whatsapp_number: "",
  birthday: "", access_code: "", emergency_contact: "",
  address: "", notes: "", is_active: true,
};

export default function CleanerManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchCleaners = async () => {
    const { data } = await supabase.from("cleaners").select("*").order("is_active", { ascending: false }).order("name");
    setCleaners((data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchCleaners(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPassportFile(null);
    setModalOpen(true);
  };

  const openEdit = (c: Cleaner) => {
    setEditingId(c.id);
    setForm({
      name: c.name, phone: c.phone ?? "", telegram_id: c.telegram_id ?? "",
      whatsapp_number: c.whatsapp_number ?? "", birthday: c.birthday ?? "",
      access_code: c.access_code ?? "", emergency_contact: c.emergency_contact ?? "",
      address: c.address ?? "", notes: c.notes ?? "", is_active: c.is_active,
    });
    setPassportFile(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Введите имя" }); return; }
    setSaving(true);

    let passport_url: string | undefined;
    if (passportFile) {
      const ext = passportFile.name.split(".").pop();
      const path = `passports/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("task-attachments").upload(path, passportFile);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("task-attachments").getPublicUrl(path);
        passport_url = urlData.publicUrl;
      }
    }

    const payload: any = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      telegram_id: form.telegram_id.trim() || null,
      whatsapp_number: form.whatsapp_number.trim() || null,
      birthday: form.birthday || null,
      access_code: form.access_code.trim() || null,
      emergency_contact: form.emergency_contact.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };
    if (passport_url) payload.passport_url = passport_url;

    if (editingId) {
      await supabase.from("cleaners").update(payload).eq("id", editingId);
      toast({ title: "Уборщица обновлена" });
    } else {
      await supabase.from("cleaners").insert(payload);
      toast({ title: "Уборщица добавлена" });
    }

    setSaving(false);
    setModalOpen(false);
    fetchCleaners();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("cleaners").delete().eq("id", id);
    toast({ title: "Уборщица удалена" });
    setDeleteConfirm(null);
    fetchCleaners();
  };

  const userRole = (() => {
    try { return JSON.parse(sessionStorage.getItem("cleaning_user") || "{}").role; } catch { return ""; }
  })();

  if (userRole !== "admin" && userRole !== "coordinator") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card><CardContent className="p-6 text-center">
          <p className="text-lg font-semibold">Доступ запрещён</p>
          <Button className="mt-4" onClick={() => navigate("/cleaning")}>Назад</Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/cleaning")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex-1">👩‍🔧 Управление уборщицами</h1>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Добавить</Button>
      </div>

      {loading ? <p className="text-center text-muted-foreground">Загрузка...</p> : (
        <div className="space-y-3">
          {cleaners.map(c => (
            <Card key={c.id} className={cn(c.is_active ? "" : "opacity-50")}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-base">{c.name}</span>
                      {c.is_active ? (
                        <Badge variant="default" className="text-xs">Активна</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Неактивна</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm text-muted-foreground">
                      {c.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</div>}
                      {c.telegram_id && <div className="flex items-center gap-1">📱 TG: {c.telegram_id}</div>}
                      {c.birthday && <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {c.birthday}</div>}
                      {c.access_code && <div className="flex items-center gap-1"><Key className="h-3 w-3" /> Код: {c.access_code}</div>}
                      {c.emergency_contact && <div className="flex items-center gap-1">🆘 {c.emergency_contact}</div>}
                      {c.address && <div className="flex items-center gap-1">📍 {c.address}</div>}
                    </div>
                    {c.notes && <p className="text-xs text-muted-foreground mt-1 italic">{c.notes}</p>}
                    {c.passport_url && (
                      <a href={c.passport_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary underline mt-1 inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Скан паспорта
                      </a>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(c.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Add modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Редактировать уборщицу" : "Новая уборщица"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>ФИО *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Телефон</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+34..." />
              </div>
              <div>
                <Label>Telegram ID</Label>
                <Input value={form.telegram_id} onChange={e => setForm(f => ({ ...f, telegram_id: e.target.value }))} placeholder="123456789" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp_number} onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} placeholder="+34..." />
              </div>
              <div>
                <Label>Дата рождения</Label>
                <Input type="date" value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Код доступа к апартаментам</Label>
              <Input value={form.access_code} onChange={e => setForm(f => ({ ...f, access_code: e.target.value }))} placeholder="1234" />
            </div>
            <div>
              <Label>Экстренный контакт</Label>
              <Input value={form.emergency_contact} onChange={e => setForm(f => ({ ...f, emergency_contact: e.target.value }))} placeholder="Имя, телефон" />
            </div>
            <div>
              <Label>Адрес</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <Label>Скан паспорта</Label>
              <div className="flex items-center gap-2">
                <Input type="file" accept="image/*,application/pdf" onChange={e => setPassportFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <div>
              <Label>Заметки</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              <Label>Активна</Label>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "Сохранение..." : editingId ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Удалить уборщицу?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Это действие нельзя отменить.</p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="flex-1">Отмена</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)} className="flex-1">Удалить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
