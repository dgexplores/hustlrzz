import { AuthGate } from "@/components/auth/AuthGate";
import { HomeContent } from "@/components/home/HomeContent";

export default function Home() {
  return (
    <AuthGate>
      <HomeContent />
    </AuthGate>
  );
}