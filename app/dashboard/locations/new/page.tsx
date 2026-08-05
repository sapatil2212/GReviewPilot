"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { LocationForm } from "../_components/location-form";

export default function NewLocationPage() {
  return (
    <>
      <PageHeader
        title="New location"
        breadcrumbs={[
          { label: "Locations", href: "/dashboard/locations" },
          { label: "New" },
        ]}
      />
      <LocationForm mode="create" />
    </>
  );
}
