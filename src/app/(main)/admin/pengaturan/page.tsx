import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/server/auth";
import { getSettings } from "@/server/queries";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Pengaturan" />
      <Card>
        <SettingsForm communityName={settings.communityName} defaultAmount={settings.defaultAmount} />
      </Card>
    </>
  );
}
