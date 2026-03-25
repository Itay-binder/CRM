import { redirect } from "next/navigation";
import { authDisabled, getSessionWithProfile } from "@/lib/auth/session";
import CrmShell from "@/app/components/CrmShell";
import PipelineClient from "@/app/pipeline/PipelineClient";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  if (authDisabled()) redirect("/login");
  const s = await getSessionWithProfile();
  if (!s) redirect("/login?returnTo=/pipeline");

  return (
    <CrmShell email={s.profile.email}>
      <PipelineClient />
    </CrmShell>
  );
}

