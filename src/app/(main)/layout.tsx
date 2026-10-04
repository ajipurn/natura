import { BottomNav } from "@/components/bottom-nav";
import { requireUser } from "@/server/auth";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-5 print:max-w-none print:p-0">{children}</div>
      <BottomNav isAdmin={user.role === "admin"} />
    </>
  );
}
