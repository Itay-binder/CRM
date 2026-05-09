import { notFound } from "next/navigation";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import {
  getMoverProfileBySlug,
  getReviews,
  getPhotos,
} from "@/movers-profile/repo";
import MoverProfileView from "@/movers-profile/components/MoverProfileView";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return { title: "פרופיל מוביל | LiftyGo" };
  return {
    title: `${profile.name} | LiftyGo`,
    description: profile.bio || `${profile.name} - מוביל מקצועי ב-LiftyGo`,
    openGraph: {
      title: `${profile.name} | LiftyGo`,
      description: profile.bio || `${profile.name} - מוביל מקצועי`,
      images: profile.profileImageUrl ? [profile.profileImageUrl] : [],
    },
  };
}

export default async function MoverProfilePage({ params }: Props) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);

  if (!profile || !profile.isActive) {
    notFound();
  }

  const [reviews, photos] = await Promise.all([
    getReviews(db, profile.id, false),
    getPhotos(db, profile.id, false),
  ]);

  const data = {
    ...profile,
    reviews,
    photos,
  };

  return <MoverProfileView data={data} />;
}