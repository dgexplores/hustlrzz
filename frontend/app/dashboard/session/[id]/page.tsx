import { AuthGate } from "@/components/auth/AuthGate";
import { SessionDetailPanel } from "@/components/dashboard/SessionDetailPanel";

export default function SessionDetailPage() {
  return (
    <AuthGate>
      <SessionDetailPanel />
    </AuthGate>
  );
}
