import { AuthGate } from "@/components/auth/AuthGate";
import { InterviewPanel } from "@/components/interview/InterviewPanel";

export default function InterviewPage() {
  return (
    <AuthGate>
      <InterviewPanel />
    </AuthGate>
  );
}