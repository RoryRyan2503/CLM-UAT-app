import { listDefects } from "@/lib/data/defects";
import { DefectsManager } from "@/components/admin/defects-manager";

export default async function AdminDefectsPage() {
  const defects = await listDefects();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Defects & retests</h1>
        <p className="text-sm text-foreground-muted">Track defects logged during testing and update their status.</p>
      </div>
      <DefectsManager defects={defects} />
    </div>
  );
}
