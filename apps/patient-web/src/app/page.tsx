import { PatientIntakeFlow } from "@/components/patient-intake-flow";

export const dynamic = "force-dynamic";

export default function PatientWebPage() {
  const isDemoMode = process.env.DEMO_MODE === "true";
  return (
    <>
      {isDemoMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
          SYNTHETIC DEMO ENVIRONMENT &mdash; DO NOT ENTER REAL PHI
        </div>
      )}
      <PatientIntakeFlow />
    </>
  );
}
