import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Clock, Trash2, Key, MessageSquare, Globe, Copy, ExternalLink } from "lucide-react";
import { invoke } from "@/lib/invoke";

const APARTMENTS = ["piral_1", "piral_2", "grande", "salvador"];
const APT_LABELS: Record<string, string> = {
  piral_1: "Оазис 1",
  piral_2: "Оазис 2",
  grande: "Гранде",
  salvador: "Сальвадор",
};

interface LockCode {
  id: string;
  apartment: string;
  code: string;
  checkin_date: string | null;
  checkout_date: string | null;
  valid_from: string | null;
  valid_to: string | null;
  action: string;
  notes: string | null;
  created_at: string;
}

interface GuestMessage {
  id: string;
  apartment: string;
  code: string | null;
  language: string | null;
  sent_at: string;
  checkin_date: string | null;
  checkout_date: string | null;
}

interface GuestPortal {
  id: string;
  token: string;
  apartment: string;
  checkin_date: string;
  checkout_date: string;
  door_code: string | null;
  wifi_name: string | null;
  wifi_pass: string | null;
  guests_count: number | null;
  status: string;
  created_at: string;
}

const LockCodes = () => {
  const navigate = useNavigate();
  const [codes, setCodes] = useState<LockCode[]>([]);
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [portals, setPortals] = useState<GuestPortal[]>([]);
  const [filterApt, setFilterApt] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [portalDialogOpen, setPortalDialogOpen] = useState(false);
  const [form, setForm] = useState({
    apartment: "piral_1",
    code: "",
    checkin_date: "",
    checkout_date: "",
    valid_from: "",
    valid_to: "",
    action: "create",
    notes: "",
  });
  const [portalForm, setPortalForm] = useState({
    apartment: "piral_1",
    checkin_date: "",
    checkout_date: "",
    door_code: "",
    guests_count: "2",
  });

  const fetchData = async () => {
    setLoading(true);
    const [codesRes, msgsRes, portalsRes] = await Promise.all([
      supabase.from("lock_codes_log").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("guest_messages_log").select("*").order("sent_at", { ascending: false }).limit(200),
      supabase.from("guest_portals").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (codesRes.data) setCodes(codesRes.data as LockCode[]);
    if (msgsRes.data) setMessages(msgsRes.data as GuestMessage[]);
    if (portalsRes.data) setPortals(portalsRes.data as GuestPortal[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const activeCodes = codes.filter(c => {
    if (c.action === "delete") return false;
    if (c.valid_to && new Date(c.valid_to) < new Date()) return false;
    const latest = codes.find(x => x.apartment === c.apartment && x.action !== "delete");
    return latest?.id === c.id;
  });

  const filteredCodes = filterApt === "all" ? codes : codes.filter(c => c.apartment === filterApt);
  const filteredMessages = filterApt === "all" ? messages : messages.filter(m => m.apartment === filterApt);
  const filteredPortals = filterApt === "all" ? portals : portals.filter(p => p.apartment === filterApt);

  const handleSubmit = async () => {
    if (!form.code) {
      toast({ title: "Укажите код", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("lock_codes_log").insert({
      apartment: form.apartment,
      code: form.code,
      checkin_date: form.checkin_date || null,
      checkout_date: form.checkout_date || null,
      valid_from: form.valid_from ? new Date(form.valid_from).toISOString() : null,
      valid_to: form.valid_to ? new Date(form.valid_to).toISOString() : null,
      action: form.action,
      notes: form.notes || null,
    });
    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Записано ✓" });
      setDialogOpen(false);
      setForm({ apartment: "piral_1", code: "", checkin_date: "", checkout_date: "", valid_from: "", valid_to: "", action: "create", notes: "" });
      fetchData();
    }
  };

  const handleCreatePortal = async () => {
    if (!portalForm.checkin_date || !portalForm.checkout_date) {
      toast({ title: "Укажите даты", variant: "destructive" });
      return;
    }
    const { data, error } = await invoke("bot-api", {
      body: {
        action: "create_guest_portal",
        apartment: portalForm.apartment,
        checkin_date: portalForm.checkin_date,
        checkout_date: portalForm.checkout_date,
        door_code: portalForm.door_code || null,
        guests_count: parseInt(portalForm.guests_count) || 2,
      },
    });
    if (error || !data?.success) {
      toast({ title: "Ошибка", description: error?.message || data?.error, variant: "destructive" });
    } else {
      toast({ title: "Портал создан ✓", description: data.url });
      setPortalDialogOpen(false);
      setPortalForm({ apartment: "piral_1", checkin_date: "", checkout_date: "", door_code: "", guests_count: "2" });
      fetchData();
    }
  };

  const copyUrl = (token: string) => {
    const url = `https://era-aparts.lovable.app/guest/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Ссылка скопирована ✓" });
  };

  const handleDeleteCode = async (entry: LockCode) => {
    await supabase.from("lock_codes_log").insert({
      apartment: entry.apartment,
      code: entry.code,
      action: "delete",
      notes: `Удалён код ${entry.code}`,
    });
    toast({ title: "Код удалён" });
    fetchData();
  };

  const isPortalActive = (p: GuestPortal) => {
    if (p.status === "expired") return false;
    const today = new Date().toISOString().split("T")[0];
    return p.checkout_date >= today;
  };

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("ru-RU") : "—";
  const fmtDateTime = (d: string | null) => d ? new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="min-h-screen bg-background p-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/cleaning")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">🔑 Замки и коды</h1>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="active"><Key className="h-4 w-4 mr-1" />Активные</TabsTrigger>
          <TabsTrigger value="portals"><Globe className="h-4 w-4 mr-1" />Порталы</TabsTrigger>
          <TabsTrigger value="history"><Clock className="h-4 w-4 mr-1" />История</TabsTrigger>
          <TabsTrigger value="messages"><MessageSquare className="h-4 w-4 mr-1" />Сообщения</TabsTrigger>
        </TabsList>

        {/* Active codes */}
        <TabsContent value="active" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Текущие коды по апартаментам</p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />Записать код</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Записать код замка</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Select value={form.apartment} onValueChange={v => setForm(f => ({ ...f, apartment: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APARTMENTS.map(a => <SelectItem key={a} value={a}>{APT_LABELS[a]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Код" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Заезд</label>
                      <Input type="date" value={form.checkin_date} onChange={e => setForm(f => ({ ...f, checkin_date: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Выезд</label>
                      <Input type="date" value={form.checkout_date} onChange={e => setForm(f => ({ ...f, checkout_date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Действует с</label>
                      <Input type="datetime-local" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Действует до</label>
                      <Input type="datetime-local" value={form.valid_to} onChange={e => setForm(f => ({ ...f, valid_to: e.target.value }))} />
                    </div>
                  </div>
                  <Select value={form.action} onValueChange={v => setForm(f => ({ ...f, action: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="create">Создать</SelectItem>
                      <SelectItem value="extend">Продлить</SelectItem>
                      <SelectItem value="delete">Удалить</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea placeholder="Заметки" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                  <Button className="w-full" onClick={handleSubmit}>Сохранить</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground py-8">Загрузка...</p>
          ) : activeCodes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Нет активных кодов</p>
          ) : (
            <div className="grid gap-3">
              {activeCodes.map(c => (
                <Card key={c.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{APT_LABELS[c.apartment] ?? c.apartment}</p>
                      <p className="text-2xl font-mono font-bold">{c.code}</p>
                      <p className="text-xs text-muted-foreground">
                        до {fmtDateTime(c.valid_to)}
                        {c.checkin_date && ` · заезд ${fmtDate(c.checkin_date)}`}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteCode(c)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Portals */}
        <TabsContent value="portals" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Гостевые порталы</p>
            <Dialog open={portalDialogOpen} onOpenChange={setPortalDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />Создать портал</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Новый гостевой портал</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Select value={portalForm.apartment} onValueChange={v => setPortalForm(f => ({ ...f, apartment: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APARTMENTS.map(a => <SelectItem key={a} value={a}>{APT_LABELS[a]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Заезд</label>
                      <Input type="date" value={portalForm.checkin_date} onChange={e => setPortalForm(f => ({ ...f, checkin_date: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Выезд</label>
                      <Input type="date" value={portalForm.checkout_date} onChange={e => setPortalForm(f => ({ ...f, checkout_date: e.target.value }))} />
                    </div>
                  </div>
                  <Input placeholder="Код двери" value={portalForm.door_code} onChange={e => setPortalForm(f => ({ ...f, door_code: e.target.value }))} />
                  <Input type="number" placeholder="Кол-во гостей" value={portalForm.guests_count} onChange={e => setPortalForm(f => ({ ...f, guests_count: e.target.value }))} />
                  <Button className="w-full" onClick={handleCreatePortal}>Создать портал</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Select value={filterApt} onValueChange={setFilterApt}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Все апартаменты" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все апартаменты</SelectItem>
              {APARTMENTS.map(a => <SelectItem key={a} value={a}>{APT_LABELS[a]}</SelectItem>)}
            </SelectContent>
          </Select>

          {loading ? (
            <p className="text-center text-muted-foreground py-8">Загрузка...</p>
          ) : filteredPortals.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Нет порталов</p>
          ) : (
            <div className="grid gap-3">
              {filteredPortals.map(p => {
                const active = isPortalActive(p);
                return (
                  <Card key={p.id} className={!active ? "opacity-60" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{APT_LABELS[p.apartment] ?? p.apartment}</span>
                            <Badge variant={active ? "default" : "secondary"}>
                              {active ? "Активен" : "Истёк"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {fmtDate(p.checkin_date)} — {fmtDate(p.checkout_date)}
                            {p.guests_count && ` · ${p.guests_count} гостей`}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => copyUrl(p.token)} title="Копировать ссылку">
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" asChild title="Открыть портал">
                            <a href={`/guest/${p.token}`} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono bg-muted px-2 py-0.5 rounded">{p.token}</span>
                        {p.door_code && <span>· код: <strong>{p.door_code}</strong></span>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="space-y-4">
          <Select value={filterApt} onValueChange={setFilterApt}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Все апартаменты" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все апартаменты</SelectItem>
              {APARTMENTS.map(a => <SelectItem key={a} value={a}>{APT_LABELS[a]}</SelectItem>)}
            </SelectContent>
          </Select>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Апартамент</TableHead>
                <TableHead>Код</TableHead>
                <TableHead>Действие</TableHead>
                <TableHead>До</TableHead>
                <TableHead>Дата</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCodes.map(c => (
                <TableRow key={c.id}>
                  <TableCell>{APT_LABELS[c.apartment] ?? c.apartment}</TableCell>
                  <TableCell className="font-mono">{c.code}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded ${c.action === "create" ? "bg-green-100 text-green-800" : c.action === "extend" ? "bg-blue-100 text-blue-800" : "bg-red-100 text-red-800"}`}>
                      {c.action === "create" ? "создан" : c.action === "extend" ? "продлён" : "удалён"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{fmtDateTime(c.valid_to)}</TableCell>
                  <TableCell className="text-xs">{fmtDateTime(c.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        {/* Guest messages */}
        <TabsContent value="messages" className="space-y-4">
          <Select value={filterApt} onValueChange={setFilterApt}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Все апартаменты" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все апартаменты</SelectItem>
              {APARTMENTS.map(a => <SelectItem key={a} value={a}>{APT_LABELS[a]}</SelectItem>)}
            </SelectContent>
          </Select>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Апартамент</TableHead>
                <TableHead>Код</TableHead>
                <TableHead>Язык</TableHead>
                <TableHead>Отправлено</TableHead>
                <TableHead>Заезд</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMessages.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Нет записей</TableCell></TableRow>
              ) : filteredMessages.map(m => (
                <TableRow key={m.id}>
                  <TableCell>{APT_LABELS[m.apartment] ?? m.apartment}</TableCell>
                  <TableCell className="font-mono">{m.code ?? "—"}</TableCell>
                  <TableCell>{m.language ?? "—"}</TableCell>
                  <TableCell className="text-xs">{fmtDateTime(m.sent_at)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(m.checkin_date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LockCodes;
