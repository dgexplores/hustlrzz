import { AuthGate } from "@/components/auth/AuthGate";
import { CoachingPanel } from "@/components/coaching/CoachingPanel";

export default function CoachingPage() {
  return (
    <AuthGate>
      <CoachingPanel />
    </AuthGate>
  );
}