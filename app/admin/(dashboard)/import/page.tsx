import { ImportWorkbook } from "@/components/admin/import-workbook";

export default function AdminImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Import test cases</h1>
        <p className="text-sm text-foreground-muted">
          Upload the revised catalog workbook or CSV to replace the active test-case definitions. Existing evaluations are retained;
          definitions missing from a full catalog are archived. Legacy test-case imports update matching IDs without archiving anything.
        </p>
      </div>
      <ImportWorkbook />
    </div>
  );
}
