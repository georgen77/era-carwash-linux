import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, BarChart3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchExtraReport, type ReportType, type ExtraReportResult, type AnalyticsResult } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/i18n";

function getAuthToken(): string | null {
  return localStorage.getItem('carwash_token');
}

type ActiveReport = 'collections' | 'analytics' | null;

const REPORT_BUTTONS: { type: ActiveReport; labelKey: string; icon: React.ReactNode; descKey: string }[] = [
  { type: "collections", labelKey: "collections", icon: <Wallet className="h-4 w-4" />, descKey: "collectionsDesc" },
  { type: "analytics", labelKey: "analytics", icon: <BarChart3 className="h-4 w-4" />, descKey: "analyticsDesc" },
];

interface Props {
  dateFrom: string;
  dateTo: string;
}

export default function ExtraReports({ dateFrom, dateTo }: Props) {
  const { t } = useApp();
  const [activeReport, setActiveReport] = useState<ActiveReport>(null);

  const { data: collectionsData, isLoading: collectionsLoading, isError: collectionsError, error: collectionsErr } = useQuery({
    queryKey: ["extra-report", "collections", dateFrom, dateTo],
    queryFn: () => fetchExtraReport('collections', dateFrom, dateTo),
    enabled: activeReport === 'collections',
    staleTime: 1000 * 60 * 5,
  });

  const { data: analyticsData, isLoading: analyticsLoading, isError: analyticsError, error: analyticsErr } = useQuery({
    queryKey: ["analytics-report", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('scrape-carwash', {
        body: { reportType: 'analytics', dateFrom, dateTo, authToken: getAuthToken() },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: activeReport === 'analytics',
    staleTime: 1000 * 60 * 5,
  });

  const isLoading = activeReport === 'collections' ? collectionsLoading : analyticsLoading;
  const isError = activeReport === 'collections' ? collectionsError : analyticsError;
  const error = activeReport === 'collections' ? collectionsErr : analyticsErr;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {REPORT_BUTTONS.map((btn) => (
          <Button
            key={btn.type}
            variant={activeReport === btn.type ? "default" : "outline"}
            className="h-auto flex-col gap-1 py-4"
            onClick={() => setActiveReport(activeReport === btn.type ? null : btn.type)}
          >
            {btn.icon}
            <span className="text-xs font-medium">{t(btn.labelKey)}</span>
          </Button>
        ))}
      </div>

      {activeReport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {REPORT_BUTTONS.find(b => b.type === activeReport)?.icon}
              {t(REPORT_BUTTONS.find(b => b.type === activeReport)?.descKey || '')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{t('loading')}</span>
              </div>
            ) : isError ? (
              <p className="text-destructive text-sm">{t('error')}: {(error as Error)?.message}</p>
            ) : activeReport === 'collections' && collectionsData?.results ? (
              <div className="space-y-6">
                {collectionsData.results.map((result: ExtraReportResult) => (
                  <CollectionsSection key={result.washName} result={result} />
                ))}
              </div>
            ) : activeReport === 'analytics' && analyticsData?.results ? (
              <div className="space-y-6">
                {analyticsData.results.map((result: AnalyticsResult) => (
                  <AnalyticsSection key={result.washName} result={result} />
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getHoursSinceCollection(dateStr: string): number {
  // dateStr like "2026-02-20 14:08:18"
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return 9999;
  const [, y, mo, d, h, mi, s] = match;
  const collectionDate = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), parseInt(h), parseInt(mi), parseInt(s));
  const now = new Date();
  return (now.getTime() - collectionDate.getTime()) / (1000 * 60 * 60);
}

function getCollectionRowColor(hours: number): string {
  if (hours <= 28) return "text-green-700 dark:text-green-400";
  if (hours <= 50) return "text-pink-600 dark:text-pink-400";
  return "text-red-700 dark:text-red-400";
}

function CollectionsSection({ result }: { result: ExtraReportResult }) {
  const { t } = useApp();
  if (result.error) {
    return (
      <div>
        <h4 className="font-medium mb-2">{result.washName}</h4>
        <p className="text-sm text-destructive">{t('error')}: {result.error}</p>
      </div>
    );
  }

  const rows = result.rows || [];
  const headers = result.headers || [];
  const totalRow = result.totalRow || [];

  if (!rows.length) {
    return (
      <div>
        <h4 className="font-medium mb-2">{result.washName}</h4>
        <p className="text-sm text-muted-foreground">{t('noData')}</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="font-medium mb-2">{result.washName}</h4>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          {headers.length > 0 && (
            <TableHeader>
              <TableRow>
                {headers.map((h, i) => (
                  <TableHead key={i} className={cn("text-xs", i > 0 && "text-right")}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
          )}
          <TableBody>
            {rows.map((row, ri) => {
              const hours = getHoursSinceCollection(row[0] || '');
              const colorClass = getCollectionRowColor(hours);
              return (
                <TableRow key={ri}>
                  {row.map((cell, ci) => (
                    <TableCell key={ci} className={cn("text-xs py-1", ci > 0 && "text-right tabular-nums", colorClass)}>
                      {ci === 0 ? (
                        <div>
                          <span>{cell}</span>
                          {hours < 9999 && (
                            <span className="block text-[9px] opacity-70">{Math.round(hours)} {t('hoursAgo')}</span>
                          )}
                        </div>
                      ) : cell}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
          {totalRow.length > 0 && (
            <TableFooter>
              <TableRow>
                {totalRow.map((cell, ci) => (
                  <TableCell key={ci} className={cn("text-xs font-semibold", ci > 0 && "text-right tabular-nums")}>{cell}</TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}

function AnalyticsSection({ result }: { result: AnalyticsResult }) {
  const { t } = useApp();
  if (result.error) {
    return (
      <div>
        <h4 className="font-medium mb-2">{result.washName}</h4>
        <p className="text-sm text-destructive">{t('error')}: {result.error}</p>
      </div>
    );
  }

  const rows = result.rows || [];
  if (!rows.length) {
    return (
      <div>
        <h4 className="font-medium mb-2">{result.washName}</h4>
        <p className="text-sm text-muted-foreground">{t('noData')}</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="font-medium mb-2">{result.washName}</h4>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">{t('month')}</TableHead>
              <TableHead className="text-xs text-right">{t('avgCheck')}</TableHead>
              <TableHead className="text-xs text-right">{t('clients')}</TableHead>
              <TableHead className="text-xs text-right">{t('revenue2')}</TableHead>
              <TableHead className="text-xs text-right">{t('services')}</TableHead>
              <TableHead className="text-xs text-right">{t('avgActivity')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, ri) => (
              <TableRow key={ri}>
                <TableCell className="text-xs py-1">{row.month}</TableCell>
                <TableCell className="text-xs py-1 text-right tabular-nums font-medium text-primary">{row.midCheck}</TableCell>
                <TableCell className="text-xs py-1 text-right tabular-nums">{row.clCnt}</TableCell>
                <TableCell className="text-xs py-1 text-right tabular-nums">{parseFloat(row.profitTurnover || '0').toLocaleString('uk-UA', { minimumFractionDigits: 2 })}</TableCell>
                <TableCell className="text-xs py-1 text-right tabular-nums">{parseFloat(row.providedServices || '0').toLocaleString('uk-UA', { minimumFractionDigits: 2 })}</TableCell>
                <TableCell className="text-xs py-1 text-right tabular-nums">{row.midClAct}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
