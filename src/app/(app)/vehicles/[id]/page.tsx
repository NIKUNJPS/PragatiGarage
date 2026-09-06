import { VehicleDetailView } from '@/components/vehicles/vehicle-detail-view';

export const metadata = { title: 'Vehicle' };

export default function VehicleDetailPage({ params }: { params: { id: string } }) {
  return <VehicleDetailView vehicleId={params.id} />;
}
