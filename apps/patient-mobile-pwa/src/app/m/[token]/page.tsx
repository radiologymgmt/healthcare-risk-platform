import { MagicLinkReview } from "@/components/magic-link-review";

export const dynamic = "force-dynamic";

export default async function MagicTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <MagicLinkReview token={token} />;
}
