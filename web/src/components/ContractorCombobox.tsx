import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Pencil, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function ContractorCombobox({ value, onChange }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: contractors = [] } = useQuery({
    queryKey: ["contractors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contractors")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const addMut = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("contractors").upsert({ name }, { onConflict: "name" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contractors"] }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("contractors").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contractors"] });
      toast.success("Контрагента оновлено");
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contractors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contractors"] });
      toast.success("Контрагента видалено");
    },
  });

  const filtered = contractors.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (name: string) => {
    onChange(name);
    setSearch("");
    setOpen(false);
  };

  const handleAddNew = () => {
    if (!search.trim()) return;
    addMut.mutate(search.trim());
    onChange(search.trim());
    setSearch("");
    setOpen(false);
  };

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const showAddOption = search.trim() && !contractors.some(c => c.name.toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="justify-between font-normal h-10 w-full"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || "Контрагент"}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0 z-50" align="start">
        <div className="p-2 border-b">
          <Input
            ref={inputRef}
            placeholder="Пошук або новий..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-sm"
            onKeyDown={e => {
              if (e.key === "Enter" && showAddOption) handleAddNew();
            }}
          />
        </div>
        <div className="max-h-[200px] overflow-y-auto">
          {filtered.map(c => (
            <div
              key={c.id}
              className="flex items-center gap-1 px-2 py-1.5 hover:bg-accent cursor-pointer text-sm group"
            >
              {editingId === c.id ? (
                <div className="flex items-center gap-1 flex-1">
                  <Input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="h-6 text-xs flex-1"
                    onKeyDown={e => {
                      if (e.key === "Enter" && editName.trim()) {
                        updateMut.mutate({ id: c.id, name: editName.trim() });
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => {
                      if (editName.trim()) updateMut.mutate({ id: c.id, name: editName.trim() });
                    }}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <div
                    className="flex-1 truncate"
                    onClick={() => handleSelect(c.name)}
                  >
                    {value === c.name && <Check className="h-3 w-3 inline mr-1" />}
                    {c.name}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100"
                    onClick={e => {
                      e.stopPropagation();
                      setEditingId(c.id);
                      setEditName(c.name);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive"
                    onClick={e => {
                      e.stopPropagation();
                      deleteMut.mutate(c.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {showAddOption && (
            <div
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent cursor-pointer text-sm text-primary font-medium"
              onClick={handleAddNew}
            >
              <Plus className="h-3.5 w-3.5" />
              Додати "{search.trim()}"
            </div>
          )}
          {filtered.length === 0 && !showAddOption && (
            <div className="p-2 text-center text-xs text-muted-foreground">
              Немає контрагентів
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
