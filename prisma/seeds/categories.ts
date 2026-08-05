/**
 * Seed the BusinessCategory catalog with a starter set of common
 * industries. Run with:
 *
 *   npx tsx prisma/seeds/categories.ts
 *
 * The list is intentionally shallow to keep this an initial seed —
 * production deployments should periodically sync with Google's
 * gcid categories via the Business Profile API.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface SeedCategory {
  slug: string;
  name: string;
  googleCategoryId?: string;
  children?: SeedCategory[];
}

const CATEGORIES: SeedCategory[] = [
  {
    slug: "food-drink",
    name: "Food & Drink",
    children: [
      { slug: "restaurant", name: "Restaurant", googleCategoryId: "gcid:restaurant" },
      { slug: "cafe", name: "Cafe", googleCategoryId: "gcid:cafe" },
      { slug: "bakery", name: "Bakery", googleCategoryId: "gcid:bakery" },
      { slug: "bar", name: "Bar", googleCategoryId: "gcid:bar" },
      { slug: "fast-food", name: "Fast Food Restaurant", googleCategoryId: "gcid:fast_food_restaurant" },
      { slug: "cloud-kitchen", name: "Cloud Kitchen" },
    ],
  },
  {
    slug: "health-medical",
    name: "Health & Medical",
    children: [
      { slug: "hospital", name: "Hospital", googleCategoryId: "gcid:hospital" },
      { slug: "clinic", name: "Medical Clinic", googleCategoryId: "gcid:medical_clinic" },
      { slug: "dental-clinic", name: "Dental Clinic", googleCategoryId: "gcid:dental_clinic" },
      { slug: "pharmacy", name: "Pharmacy", googleCategoryId: "gcid:pharmacy" },
      { slug: "diagnostic-center", name: "Diagnostic Center" },
      { slug: "veterinary", name: "Veterinary Care", googleCategoryId: "gcid:veterinarian" },
    ],
  },
  {
    slug: "hospitality",
    name: "Hospitality",
    children: [
      { slug: "hotel", name: "Hotel", googleCategoryId: "gcid:hotel" },
      { slug: "resort", name: "Resort" },
      { slug: "hostel", name: "Hostel" },
      { slug: "guest-house", name: "Guest House" },
      { slug: "banquet-hall", name: "Banquet Hall" },
    ],
  },
  {
    slug: "beauty-wellness",
    name: "Beauty & Wellness",
    children: [
      { slug: "salon", name: "Hair Salon", googleCategoryId: "gcid:hair_salon" },
      { slug: "spa", name: "Spa", googleCategoryId: "gcid:spa" },
      { slug: "gym", name: "Gym", googleCategoryId: "gcid:gym" },
      { slug: "yoga-studio", name: "Yoga Studio" },
      { slug: "nail-salon", name: "Nail Salon" },
    ],
  },
  {
    slug: "retail",
    name: "Retail",
    children: [
      { slug: "clothing-store", name: "Clothing Store", googleCategoryId: "gcid:clothing_store" },
      { slug: "electronics-store", name: "Electronics Store" },
      { slug: "grocery-store", name: "Grocery Store", googleCategoryId: "gcid:grocery_store" },
      { slug: "supermarket", name: "Supermarket" },
      { slug: "jewelry-store", name: "Jewelry Store" },
      { slug: "furniture-store", name: "Furniture Store" },
    ],
  },
  {
    slug: "professional-services",
    name: "Professional Services",
    children: [
      { slug: "law-firm", name: "Law Firm" },
      { slug: "accounting-firm", name: "Accounting Firm" },
      { slug: "consulting", name: "Consulting Agency" },
      { slug: "marketing-agency", name: "Marketing Agency" },
      { slug: "real-estate", name: "Real Estate Agency" },
    ],
  },
  {
    slug: "education",
    name: "Education",
    children: [
      { slug: "school", name: "School" },
      { slug: "college", name: "College" },
      { slug: "coaching", name: "Coaching Institute" },
      { slug: "training-center", name: "Training Center" },
      { slug: "daycare", name: "Daycare" },
    ],
  },
  {
    slug: "automotive",
    name: "Automotive",
    children: [
      { slug: "car-dealer", name: "Car Dealer" },
      { slug: "car-service", name: "Car Service Center" },
      { slug: "car-wash", name: "Car Wash" },
      { slug: "auto-parts", name: "Auto Parts Store" },
    ],
  },
  {
    slug: "home-services",
    name: "Home Services",
    children: [
      { slug: "plumbing", name: "Plumbing Service" },
      { slug: "electrical", name: "Electrical Service" },
      { slug: "cleaning", name: "Cleaning Service" },
      { slug: "moving", name: "Moving Company" },
      { slug: "pest-control", name: "Pest Control" },
    ],
  },
  {
    slug: "entertainment",
    name: "Entertainment",
    children: [
      { slug: "event-venue", name: "Event Venue" },
      { slug: "photographer", name: "Photographer" },
      { slug: "movie-theater", name: "Movie Theater" },
      { slug: "amusement-park", name: "Amusement Park" },
    ],
  },
];

async function upsertCategory(cat: SeedCategory, parentId: string | null) {
  const existing = await prisma.businessCategory.findUnique({
    where: { slug: cat.slug },
  });
  const row = existing
    ? await prisma.businessCategory.update({
        where: { slug: cat.slug },
        data: {
          name: cat.name,
          googleCategoryId: cat.googleCategoryId ?? existing.googleCategoryId,
          parentId,
          isActive: true,
        },
      })
    : await prisma.businessCategory.create({
        data: {
          slug: cat.slug,
          name: cat.name,
          googleCategoryId: cat.googleCategoryId ?? null,
          parentId,
        },
      });

  for (const child of cat.children ?? []) {
    await upsertCategory(child, row.id);
  }
}

async function main() {
  for (const c of CATEGORIES) {
    await upsertCategory(c, null);
  }
  const count = await prisma.businessCategory.count();
  console.log(`\u2713 Seeded business categories. Total rows: ${count}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
