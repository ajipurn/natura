import { can } from "@/lib/permissions";
import { useAuth } from "@/client/auth";
import { PageTitle } from "@/components/ui";
import { RondaApp } from "./ronda-app";

export function RondaPage() {
  const user = useAuth().data?.user;
  return (
    <>
      <PageTitle title="Ronda" />
      <RondaApp isAdmin={Boolean(user && can(user.role, "patrols", true))} />
    </>
  );
}
