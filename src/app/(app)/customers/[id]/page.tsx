import { CustomerDetailView } from '@/components/customers/customer-detail-view';

export const metadata = { title: 'Customer' };

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  return <CustomerDetailView customerId={params.id} />;
}
