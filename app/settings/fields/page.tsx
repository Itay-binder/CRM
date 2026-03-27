import { redirect } from "next/navigation";
import { authDisabled, getSessionWithProfile } from "@/lib/auth/session";
import CrmShell from "@/app/components/CrmShell";
import FieldsClient from "./FieldsClient";

export const dynamic = "force-dynamic";

export default async function FieldsPage() {
  if (authDisabled()) redirect("/login");
  const s = await getSessionWithProfile();
  if (!s) redirect("/login?returnTo=/settings/fields");

  return (
    <CrmShell email={s.profile.email}>
      <FieldsClient />
    </CrmShell>
  );
}

