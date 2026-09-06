import { JobCardDetailView } from '@/components/job-cards/job-card-detail-view';

export const metadata = { title: 'Job Card' };

export default function JobCardDetailPage({ params }: { params: { id: string } }) {
  return <JobCardDetailView jobCardId={params.id} />;
}
