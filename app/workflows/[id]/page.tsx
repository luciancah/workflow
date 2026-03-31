import WorkflowBuilderPage from '@/components/WorkflowBuilderPage';

export default function WorkflowPage({ params }: { params: { id: string } }) {
  return <WorkflowBuilderPage workflowId={Number(params.id)} />;
}

