import { Detail } from '@/components/screens/Detail';

export default function Page({ params }: { params: { id: string } }) {
  return <Detail id={params.id} />;
}
