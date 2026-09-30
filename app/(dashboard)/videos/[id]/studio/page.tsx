import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStudioData } from "@/modules/studio/lib/queries";
import { Studio } from "@/modules/studio/components/studio";

// The library import copies ~200 images; give it room.
export const maxDuration = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getStudioData(id);
  return { title: data ? `Thumbnail Studio · #${data.project.number}` : "Thumbnail Studio" };
}

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getStudioData(id);
  if (!data) notFound();
  return <Studio data={data} />;
}
