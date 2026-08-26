import { AuthGate } from "@/components/auth/AuthGate";
import { AssessmentPanel } from "@/components/assessment/AssessmentPanel";

export default function AssessmentPage() {
  return (
    <AuthGate>
      <AssessmentPanel />
    </AuthGate>
  );
}
