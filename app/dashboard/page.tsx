import { getSessionWithProfile, authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import DashboardClient from "@/app/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (authDisabled()) redirect("/login");
  const s = await getSessionWithProfile();
  if (!s) redirect("/login?returnTo=/dashboard");

  return (
    <CrmShell email={s.profile.email}>
      <DashboardClient />
    </CrmShell>
  );
}

