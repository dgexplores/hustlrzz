import { AuthGate } from "@/components/auth/AuthGate";
import { KnowledgePanel } from "@/components/knowledge/KnowledgePanel";

export default function KnowledgePage() {
  return (
    <AuthGate>
      <KnowledgePanel />
    </AuthGate>
  );
}
