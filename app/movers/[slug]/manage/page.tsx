import { notFound } from "next/navigation";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import {
  getMoverProfileBySlug,
  getReviews,
  getPhotos,
} from "@/movers-profile/repo";
import { getMoverSession } from "@/movers-profile/session";
import { normalizePhoneForAuth } from "@/movers-profile/session";
import SmsLoginClient from "@/movers-profile/components/SmsLoginClient";
import ManagePageClient from "@/movers-profile/components/ManagePageClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function ManagePage({ params }: Props) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);

  if (!profile) notFound();

  const session = await getMoverSession();
  const authed =
    session && normalizePhoneForAuth(session.phone) === normalizePhoneForAuth(profile.phone);

  if (!authed) {
    return <SmsLoginClient slug={slug} />;
  }

  const [reviews, photos] = await Promise.all([
    getReviews(db, profile.id, true),
    getPhotos(db, profile.id, true),
  ]);

  const data = { ...profile, reviews, photos };

  return <ManagePageClient data={data} />;
}