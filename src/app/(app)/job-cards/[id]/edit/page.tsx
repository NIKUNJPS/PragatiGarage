import { EditJobCardView } from '@/components/job-cards/edit-job-card-view';

export const metadata = { title: 'Edit Job Card' };

export default function EditJobCardPage({ params }: { params: { id: string } }) {
  return <EditJobCardView jobCardId={params.id} />;
}
