import { useQuery } from "@tanstack/react-query";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader } from "@/components/ui";
import { settingsQuery } from "../queries";
import { SettingsForm } from "./settings-form";

export function PengaturanPage() {
  const query = useQuery(settingsQuery);
  return (
    <>
      <PageHeader title="Pengaturan" />
      <QueryState query={query}>
        {(settings) => (
          <Card className="max-w-xl">
            <SettingsForm communityName={settings.communityName} defaultAmount={settings.defaultAmount} />
          </Card>
        )}
      </QueryState>
    </>
  );
}
