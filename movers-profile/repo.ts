import type { MoverProfile, MoverReview, MoverPhoto, MoverService } from "./types";
import type { Firestore, DocumentSnapshot } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

// ────────────── Profile CRUD ──────────────

export async function getMoverProfileBySlug(
  db: Firestore,
  slug: string
): Promise<MoverProfile | null> {
  const snap = await db
    .collection("moverProfiles")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return docToProfile(snap.docs[0]);
}

export async function getMoverProfileById(
  db: Firestore,
  id: string
): Promise<MoverProfile | null> {
  const doc = await db.collection("moverProfiles").doc(id).get();
  if (!doc.exists) return null;
  return docToProfile(doc);
}

export async function listMoverProfiles(db: Firestore): Promise<MoverProfile[]> {
  const snap = await db
    .collection("moverProfiles")
    .orderBy("createdAt", "desc")
    .get();
  return snap.docs.map(docToProfile);
}

export async function createMoverProfile(
  db: Firestore,
  data: {
    slug: string;
    name: string;
    phone: string;
    bio?: string;
    services?: MoverService[];
    profileImageUrl?: string;
    coverArea?: string;
  }
): Promise<MoverProfile> {
  const ref = db.collection("moverProfiles").doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    slug: data.slug,
    name: data.name,
    phone: data.phone,
    bio: data.bio ?? "",
    services: data.services ?? [],
    profileImageUrl: data.profileImageUrl ?? "",
    coverArea: data.coverArea ?? "פעיל בכל הארץ",
    isActive: true,
    createdAt: now,
    updatedAt: now,
    rating: 0,
    reviewCount: 0,
    ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
  const doc = await ref.get();
  return docToProfile(doc);
}

export async function updateMoverProfile(
  db: Firestore,
  id: string,
  updates: Partial<
    Pick<
      MoverProfile,
      | "name"
      | "bio"
      | "services"
      | "profileImageUrl"
      | "coverArea"
      | "isActive"
      | "phone"
    >
  >
): Promise<void> {
  await db
    .collection("moverProfiles")
    .doc(id)
    .update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
}

export async function deleteMoverProfile(db: Firestore, id: string): Promise<void> {
  await db.collection("moverProfiles").doc(id).delete();
}

// ────────────── Reviews ──────────────

export async function addReview(
  db: Firestore,
  profileId: string,
  review: { reviewerName: string; rating: number; text: string }
): Promise<MoverReview> {
  const ref = db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("reviews")
    .doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    reviewerName: review.reviewerName,
    rating: review.rating,
    text: review.text,
    isHidden: false,
    createdAt: now,
  });

  // Update aggregate stats in a transaction
  await db.runTransaction(async (tx) => {
    const profileRef = db.collection("moverProfiles").doc(profileId);
    const profileDoc = await tx.get(profileRef);
    const d = profileDoc.data() ?? {};
    const breakdown: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      ...(d.ratingBreakdown ?? {}),
    };
    breakdown[review.rating] = (breakdown[review.rating] ?? 0) + 1;
    const newCount = (d.reviewCount ?? 0) + 1;
    const totalStars = Object.entries(breakdown).reduce(
      (sum, [stars, count]) => sum + Number(stars) * Number(count),
      0
    );
    const newRating = Math.round((totalStars / newCount) * 10) / 10;
    tx.update(profileRef, {
      reviewCount: newCount,
      ratingBreakdown: breakdown,
      rating: newRating,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const doc = await ref.get();
  return docToReview(doc);
}

export async function getReviews(
  db: Firestore,
  profileId: string,
  includeHidden = false
): Promise<MoverReview[]> {
  let query: FirebaseFirestore.Query = db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("reviews")
    .orderBy("createdAt", "desc");
  if (!includeHidden) {
    query = query.where("isHidden", "==", false);
  }
  const snap = await query.get();
  return snap.docs.map(docToReview);
}

export async function toggleReviewHidden(
  db: Firestore,
  profileId: string,
  reviewId: string,
  isHidden: boolean
): Promise<void> {
  await db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("reviews")
    .doc(reviewId)
    .update({ isHidden });
}

// ────────────── Photos ──────────────

export async function addPhoto(
  db: Firestore,
  profileId: string,
  photo: { url: string; caption?: string; uploadedBy: "mover" | "customer" }
): Promise<MoverPhoto> {
  const ref = db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("photos")
    .doc();
  await ref.set({
    url: photo.url,
    caption: photo.caption ?? "",
    uploadedBy: photo.uploadedBy,
    isHidden: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  const doc = await ref.get();
  return docToPhoto(doc);
}

export async function getPhotos(
  db: Firestore,
  profileId: string,
  includeHidden = false
): Promise<MoverPhoto[]> {
  let query: FirebaseFirestore.Query = db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("photos")
    .orderBy("createdAt", "desc");
  if (!includeHidden) {
    query = query.where("isHidden", "==", false);
  }
  const snap = await query.get();
  return snap.docs.map(docToPhoto);
}

export async function togglePhotoHidden(
  db: Firestore,
  profileId: string,
  photoId: string,
  isHidden: boolean
): Promise<void> {
  await db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("photos")
    .doc(photoId)
    .update({ isHidden });
}

// ────────────── Converters ──────────────

function docToProfile(doc: DocumentSnapshot): MoverProfile {
  const d = doc.data() ?? {};
  return {
    id: doc.id,
    slug: d.slug ?? "",
    name: d.name ?? "",
    phone: d.phone ?? "",
    bio: d.bio ?? "",
    services: d.services ?? [],
    profileImageUrl: d.profileImageUrl ?? "",
    coverArea: d.coverArea ?? "פעיל בכל הארץ",
    isActive: d.isActive ?? true,
    createdAt: d.createdAt?.toDate() ?? new Date(),
    updatedAt: d.updatedAt?.toDate() ?? new Date(),
    rating: d.rating ?? 0,
    reviewCount: d.reviewCount ?? 0,
    ratingBreakdown: d.ratingBreakdown ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };
}

function docToReview(doc: DocumentSnapshot): MoverReview {
  const d = doc.data() ?? {};
  return {
    id: doc.id,
    reviewerName: d.reviewerName ?? "",
    rating: d.rating ?? 5,
    text: d.text ?? "",
    isHidden: d.isHidden ?? false,
    createdAt: d.createdAt?.toDate() ?? new Date(),
  };
}

function docToPhoto(doc: DocumentSnapshot): MoverPhoto {
  const d = doc.data() ?? {};
  return {
    id: doc.id,
    url: d.url ?? "",
    caption: d.caption,
    uploadedBy: d.uploadedBy ?? "customer",
    isHidden: d.isHidden ?? false,
    createdAt: d.createdAt?.toDate() ?? new Date(),
  };
}