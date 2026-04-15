import { permanentRedirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function GenerateRedirectPage({ params }: Props) {
  const { id } = await params;
  permanentRedirect(`/projects/${id}/pipeline`);
}
