import { useQuery } from "@tanstack/react-query";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader } from "@/components/ui";
import { settingsQuery } from "../queries";
import { LogoSettings } from "./logo-settings";
import { SettingsForm } from "./settings-form";

export function PengaturanPage() {
  const query = useQuery(settingsQuery);
  return (
    <>
      <PageHeader title="Pengaturan" />
      <QueryState query={query}>
        {(settings) => (
          <Card className="max-w-xl">
            <LogoSettings logoUrl={settings.logoUrl} />
            <div className="mt-5 border-t border-line pt-5">
              <SettingsForm
                communityName={settings.communityName}
                defaultAmount={settings.defaultAmount}
                cashPublic={settings.cashPublic}
              />
            </div>
          </Card>
        )}
      </QueryState>
    </>
  );
}
