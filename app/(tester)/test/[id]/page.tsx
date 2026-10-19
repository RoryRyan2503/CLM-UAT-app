import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTesterSession } from "@/lib/auth/testerSession";
import { getTestCaseWorkflow } from "@/lib/data/testCaseWorkflow";
import { listAssignmentsForTester } from "@/lib/data/assignments";
import { getEvidenceEnabled } from "@/lib/data/appSettings";
import { AppError } from "@/lib/actionResult";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TestResultForm } from "@/components/test-result-form";
import { ComparisonForm } from "@/components/comparison-form";
import { isCompletedStatus } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

export default async function TestCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tester = await requireTesterSession();

  let workflow;
  try {
    workflow = await getTestCaseWorkflow(tester.id, id);
  } catch (error) {
    if (error instanceof AppError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) {
      notFound();
    }
    throw error;
  }

  const [allAssignments, evidenceEnabled] = await Promise.all([
    listAssignmentsForTester(tester.id),
    getEvidenceEnabled(),
  ]);
  const currentIndex = allAssignments.findIndex((a) => a.testCaseUuid === id);
  const nextAssignment = allAssignments[currentIndex + 1];

  const bothComplete =
    isCompletedStatus(workflow.ironclad.result.status) && isCompletedStatus(workflow.sirion.result.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{workflow.testCase.test_case_id}</h1>
            <Badge variant="outline">{workflow.testCase.functional_area}</Badge>
            {workflow.testCase.persona ? <Badge variant="outline">{workflow.testCase.persona}</Badge> : null}
          </div>
          <p className="text-sm text-foreground-muted">{workflow.testCase.scenario}</p>
        </div>
        {nextAssignment ? (
          <Button asChild variant="outline">
            <Link href={`/test/${nextAssignment.testCaseUuid}`}>
              Continue to next test
              <ChevronRight />
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Test definition</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <ReadOnlyField label="Suggested Steps" value={workflow.testCase.suggested_steps} />
          <ReadOnlyField label="Expected Result" value={workflow.testCase.expected_result} />
          <ReadOnlyField label="Required Evidence" value={workflow.testCase.required_evidence} />
        </CardContent>
      </Card>

      <Tabs defaultValue="ironclad">
        <TabsList>
          <TabsTrigger value="ironclad">Ironclad</TabsTrigger>
          <TabsTrigger value="sirion">Sirion</TabsTrigger>
          <TabsTrigger value="compare" disabled={!bothComplete}>
            Compare
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ironclad">
          <TestResultForm
            key={workflow.ironclad.result.id}
            vendorName="Ironclad"
            assignmentId={workflow.ironclad.assignment.id}
            result={workflow.ironclad.result}
            evidence={workflow.ironclad.evidence}
            defect={workflow.ironclad.defect}
            evidenceEnabled={evidenceEnabled}
            vendorId={workflow.ironclad.assignment.vendor_id}
          />
        </TabsContent>
        <TabsContent value="sirion">
          <TestResultForm
            key={workflow.sirion.result.id}
            vendorName="Sirion"
            assignmentId={workflow.sirion.assignment.id}
            result={workflow.sirion.result}
            evidence={workflow.sirion.evidence}
            defect={workflow.sirion.defect}
            evidenceEnabled={evidenceEnabled}
            vendorId={workflow.sirion.assignment.vendor_id}
          />
        </TabsContent>
        <TabsContent value="compare">
          {bothComplete ? (
            <ComparisonForm
              testerId={tester.id}
              testCaseId={workflow.testCase.id}
              ironclad={workflow.ironclad}
              sirion={workflow.sirion}
              comparison={workflow.comparison}
            />
          ) : (
            <p className="text-sm text-foreground-muted">
              Complete both Ironclad and Sirion results to unlock the comparison.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="sm:col-span-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{label}</div>
      <p className="mt-1 whitespace-pre-line text-foreground">{value}</p>
    </div>
  );
}
