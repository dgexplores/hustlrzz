import { AuthGate } from "@/components/auth/AuthGate";
import { DashboardContent } from "@/components/dashboard/DashboardContent";

export default function DashboardPage() {
  return (
    <AuthGate>
      <DashboardContent />
    </AuthGate>
  );
}