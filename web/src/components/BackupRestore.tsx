import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invoke } from "@/lib/invoke";

const BackupRestore = () => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleDownloadBackup = async () => {
    setIsDownloading(true);
    try {
      const { data, error } = await invoke('backup-movements');
      
      if (error) throw error;

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Резервная копия успешно скачана');
    } catch (error) {
      console.error('Backup error:', error);
      toast.error('Ошибка при создании резервной копии');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    try {
      const text = await file.text();
      const backupData = JSON.parse(text);

      if (!backupData.data || !Array.isArray(backupData.data)) {
        throw new Error('Неверный формат резервной копии');
      }

      const { error } = await invoke('restore-movements', {
        body: { data: backupData.data }
      });

      if (error) throw error;

      toast.success('База данных успешно восстановлена');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error('Restore error:', error);
      toast.error('Ошибка при восстановлении из резервной копии');
    } finally {
      setIsRestoring(false);
      event.target.value = '';
    }
  };

  return (
    <div className="flex gap-2 justify-center">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownloadBackup}
        disabled={isDownloading}
      >
        <Download className="h-3 w-3 mr-1" />
        {isDownloading ? 'Скачивание...' : 'Скачать резервную копию'}
      </Button>
      
      <label>
        <Button
          variant="outline"
          size="sm"
          disabled={isRestoring}
          asChild
        >
          <span>
            <Upload className="h-3 w-3 mr-1" />
            {isRestoring ? 'Восстановление...' : 'Восстановить из копии'}
          </span>
        </Button>
        <input
          type="file"
          accept=".json"
          onChange={handleRestoreBackup}
          className="hidden"
          disabled={isRestoring}
        />
      </label>
    </div>
  );
};

export default BackupRestore;
