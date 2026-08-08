import { AuthGate } from "@/components/auth/AuthGate";
import { PreparePanel } from "@/components/prepare/PreparePanel";

export default function PreparePage() {
  return (
    <AuthGate>
      <PreparePanel />
    </AuthGate>
  );
}