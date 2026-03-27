import { redirect } from "next/navigation";
import { authDisabled, getSessionWithProfile } from "@/lib/auth/session";
import CrmShell from "@/app/components/CrmShell";
import CheckoutPagesManager from "@/app/components/CheckoutPagesManager";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  if (authDisabled()) redirect("/login");
  const s = await getSessionWithProfile();
  if (!s) redirect("/login?returnTo=/billing");

  return (
    <CrmShell email={s.profile.email}>
      <CheckoutPagesManager />
    </CrmShell>
  );
}

