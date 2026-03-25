import { redirect } from "next/navigation";
import { authDisabled, getSessionWithProfile } from "@/lib/auth/session";
import CrmShell from "@/app/components/CrmShell";
import ContactsClient from "@/app/contacts/ContactsClient";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  if (authDisabled()) redirect("/login");
  const s = await getSessionWithProfile();
  if (!s) redirect("/login?returnTo=/contacts");

  return (
    <CrmShell email={s.profile.email}>
      <ContactsClient />
    </CrmShell>
  );
}

