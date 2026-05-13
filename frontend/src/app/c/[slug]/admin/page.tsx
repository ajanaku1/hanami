type Params = { slug: string };

export default async function AdminPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  return <main className="p-8">admin — {slug} (Day 2)</main>;
}
