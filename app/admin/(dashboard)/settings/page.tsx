import { EvidenceSettings } from "@/components/admin/evidence-settings";
import { getEvidenceMode } from "@/lib/data/appSettings";

export default async function AdminSettingsPage() {
  const evidenceMode = await getEvidenceMode();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-foreground-muted">Configure tester evaluation options.</p>
      </div>
      <EvidenceSettings initialMode={evidenceMode} />
    </div>
  );
}
