import { AuthGate } from "@/components/auth/AuthGate";
import { ResumeAnalyzerPanel } from "@/components/resume/ResumeAnalyzerPanel";

export default function ResumeAnalyzerPage() {
  return <AuthGate><ResumeAnalyzerPanel /></AuthGate>;
}
