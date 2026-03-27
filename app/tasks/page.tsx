import { redirect } from "next/navigation";
import { authDisabled, getSessionWithProfile } from "@/lib/auth/session";
import CrmShell from "@/app/components/CrmShell";
import TasksClient from "@/app/tasks/TasksClient";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  if (authDisabled()) redirect("/login");
  const s = await getSessionWithProfile();
  if (!s) redirect("/login?returnTo=/tasks");

  return (
    <CrmShell email={s.profile.email}>
      <TasksClient />
    </CrmShell>
  );
}

