import { ImportWorkbook } from "@/components/admin/import-workbook";

export default function AdminImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Import test cases</h1>
        <p className="text-sm text-foreground-muted">
          Upload the source workbook (.xlsx or .csv). Only Test Case ID, Functional Area, Persona, Scenario,
          Suggested Steps, Expected Result, and Required Evidence are imported; the original file is never modified.
        </p>
      </div>
      <ImportWorkbook />
    </div>
  );
}
