import { AuthGate } from "@/components/auth/AuthGate";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export default function SettingsPage() {
  return (
    <AuthGate>
      <SettingsPanel />
    </AuthGate>
  );
}
