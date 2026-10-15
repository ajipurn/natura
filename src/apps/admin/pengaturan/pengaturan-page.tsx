import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader } from "@/components/ui";
import { settingsQuery } from "../queries";
import { LogoSettings } from "./logo-settings";
import { SettingsForm } from "./settings-form";
import { TelegramSettings } from "./telegram-settings";
import { BackupSettings } from "./backup-settings";

export function PengaturanPage() {
  const query = useQuery(settingsQuery);
  return (
    <>
      <PageHeader
        title="Pengaturan"
        subtitle="Atur identitas lingkungan, jimpitan, notifikasi, dan backup."
        className="mb-6"
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <QueryState query={query}>
          {(settings) => (
            <Card className="min-w-0 overflow-hidden p-0">
              <div className="space-y-5 px-5 pt-5 sm:px-6 sm:pt-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="size-4.5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="font-semibold tracking-tight">Identitas lingkungan</h2>
                    <p className="mt-0.5 text-sm text-muted">Nama dan logo yang tampil di aplikasi.</p>
                  </div>
                </div>
                <LogoSettings logoUrl={settings.logoUrl} />
              </div>
              <SettingsForm
                communityName={settings.communityName}
                defaultAmount={settings.defaultAmount}
                cashPublic={settings.cashPublic}
                recordingStart={settings.recordingStart}
                recordingEnd={settings.recordingEnd}
              />
            </Card>
          )}
        </QueryState>
        <div className="min-w-0 space-y-5">
          <TelegramSettings />
          <BackupSettings />
        </div>
      </div>
    </>
  );
}
