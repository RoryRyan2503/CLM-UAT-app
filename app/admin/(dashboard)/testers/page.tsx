import { listPersonas, listTesters } from "@/lib/data/testers";
import { TestersManager } from "@/components/admin/testers-manager";

export default async function AdminTestersPage() {
  const [testers, personas] = await Promise.all([listTesters(), listPersonas()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Testers</h1>
        <p className="text-sm text-foreground-muted">Add testers, manage access codes, and deactivate accounts.</p>
      </div>
      <TestersManager testers={testers} personas={personas} />
    </div>
  );
}
