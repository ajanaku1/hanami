type Params = { slug: string };

export default async function ApplicantPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  return <main className="p-8">applicant chat — {slug} (Day 2)</main>;
}
