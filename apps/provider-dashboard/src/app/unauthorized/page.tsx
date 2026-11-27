import { ShieldAlert } from "lucide-react";

export default function ProviderUnauthorizedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
        <div className="h-10 w-10 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <h1 className="text-base font-semibold text-slate-900">
          Provider Dashboard Access Restricted
        </h1>
        <p className="text-xs text-slate-600 leading-relaxed">
          This clinical triage workbench requires Google Identity-Aware Proxy (IAP) SSO + MFA with{" "}
          <strong>PROVIDER</strong> or <strong>ADMIN</strong> role authorization.
        </p>
      </div>
    </main>
  );
}
