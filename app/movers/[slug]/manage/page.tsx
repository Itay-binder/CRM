import { notFound } from "next/navigation";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import {
  getMoverProfileBySlug,
  getReviews,
  getPhotos,
  listMoverProfiles,
} from "@/movers-profile/repo";
import { getMoverSession, normalizePhoneForAuth } from "@/movers-profile/session";
import { getSessionUser } from "@/lib/auth/cookiesSession";
import SmsLoginClient from "@/movers-profile/components/SmsLoginClient";
import ManagePageClient from "@/movers-profile/components/ManagePageClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function ManagePage({ params }: Props) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);

  if (!profile) notFound();

  // Check mover SMS session
  const moverSession = await getMoverSession();
  const moverAuthed =
    moverSession &&
    normalizePhoneForAuth(moverSession.phone) === normalizePhoneForAuth(profile.phone);

  // Check CRM admin session (any logged-in CRM user gets full admin access)
  const crmUser = !moverAuthed ? await getSessionUser() : null;
  const isAdmin = Boolean(crmUser);

  if (!moverAuthed && !isAdmin) {
    return <SmsLoginClient slug={slug} />;
  }

  const [reviews, photos, allProfiles] = await Promise.all([
    getReviews(db, profile.id, true),
    getPhotos(db, profile.id, true),
    // Admins get the full profile list for the switcher
    isAdmin ? listMoverProfiles(db) : Promise.resolve(null),
  ]);

  const data = { ...profile, reviews, photos };

  const allProfilesSerialized = allProfiles
    ? allProfiles.map((p) => ({ id: p.id, slug: p.slug, name: p.name, profileImageUrl: p.profileImageUrl }))
    : null;

  return (
    <ManagePageClient
      data={data}
      isAdmin={isAdmin}
      allProfiles={allProfilesSerialized}
    />
  );
}
