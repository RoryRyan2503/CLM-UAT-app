import "server-only";
import { query } from "@/lib/db/pool";
import { COMPLETED_STATUSES, PASSING_STATUSES, isCompletedStatus } from "@/lib/constants";

export interface TesterProgressRow {
  testerId: string;
  testerName: string;
  completed: number;
  total: number;
  ironcladCompleted: number;
  ironcladTotal: number;
  sirionCompleted: number;
  sirionTotal: number;
  started: boolean;
}

export interface FunctionalAreaProgressRow {
  functionalArea: string;
  completed: number;
  total: number;
}

export interface VendorProgressRow {
  vendorSlug: string;
  vendorName: string;
  completed: number;
  total: number;
}

const GRADE_ORDER = ["A", "B", "C", "D", "F", "N/A", "Missing"] as const;

export async function getProgressOverview() {
  const [testersResult, assignmentsResult] = await Promise.all([
    query<{ id: string; name: string }>(
      "select id, name from testers where is_active = true order by name",
    ),
    query<{
      tester_id: string; tester_name: string | null; vendor_slug: string; vendor_name: string;
      test_case_id: string; scenario: string; functional_area: string | null; status: string | null;
      started_at: string | null; completed_at: string | null; grade: string | null; severity: string | null;
      usability_rating: number | null; improvement_needed: boolean | null; configuration_required: boolean | null;
      vendor_assistance_required: boolean | null; defect_status: string | null;
      preferred_vendor: string | null; comparison_comments: string | null;
    }>(
      `select a.tester_id, t.name as tester_name, v.slug as vendor_slug, v.name as vendor_name,
         tc.test_case_id, tc.scenario, tc.functional_area,
         tr.status, tr.started_at, tr.completed_at, tr.grade, tr.severity, tr.usability_rating,
         tr.improvement_needed, tr.configuration_required, tr.vendor_assistance_required,
         d.status as defect_status, c.preferred_vendor, c.comments as comparison_comments
       from assignments a
       join testers t on t.id = a.tester_id and t.is_active = true
       join vendors v on v.id = a.vendor_id
       join test_cases tc on tc.id = a.test_case_id
       left join test_results tr on tr.assignment_id = a.id
       left join comparisons c on c.tester_id = a.tester_id and c.test_case_id = a.test_case_id
       left join lateral (
         select defects.status from defects where defects.test_result_id = tr.id
         order by defects.updated_at desc limit 1
       ) d on true
       where a.is_active = true
       order by tc.functional_area, tc.test_case_id, t.name`,
    ),
  ]);

  const byTester = new Map<string, TesterProgressRow>();
  for (const tester of testersResult.rows) {
    byTester.set(tester.id, {
      testerId: tester.id,
      testerName: tester.name,
      completed: 0,
      total: 0,
      ironcladCompleted: 0,
      ironcladTotal: 0,
      sirionCompleted: 0,
      sirionTotal: 0,
      started: false,
    });
  }

  const byVendor = new Map<string, VendorProgressRow>();
  const byArea = new Map<string, FunctionalAreaProgressRow>();
  const outcomesByVendor = new Map<string, Map<string, number>>();
  const gradesByVendorArea = new Map<string, Map<string, number>>();
  const heatmap = new Map<string, {
    functionalArea: string; vendorName: string; vendorSlug: string; total: number;
    completed: number; notStarted: number; inProgress: number; passing: number;
    failed: number; blocked: number; retest: number;
  }>();
  const severitiesByVendor = new Map<string, Map<string, number>>();
  const preferences = new Map<string, number>();
  const preferenceByPair = new Map<string, string>();
  const pairedResults = new Map<string, {
    ironclad: string | null; sirion: string | null; preferredVendor: string | null;
  }>();
  const attention: {
    testerName: string; vendorName: string; testCaseId: string; scenario: string;
    functionalArea: string; status: string; grade: string | null; severity: string | null;
    usabilityRating: number | null; reasons: string[]; defectStatus: string | null;
  }[] = [];

  let startedAssignments = 0;
  let completedAssignments = 0;
  const activeAssignmentsByTester = new Map<string, number>();
  const startedByTester = new Map<string, boolean>();
  const completedByTester = new Map<string, number>();
  const pairKey = (testerId: string, caseId: string) => `${testerId}:${caseId}`;

  for (const row of assignmentsResult.rows) {
    const status = row.status ?? "Not Started";
    const completed = isCompletedStatus(status);
    const started = Boolean(row.started_at);
    const area = row.functional_area ?? "Unknown";
    const vendor = row.vendor_slug;
    const tester = byTester.get(row.tester_id);
    if (tester) {
      tester.total += 1;
      if (completed) tester.completed += 1;
      tester.started ||= started;
      if (vendor === "ironclad") {
        tester.ironcladTotal += 1;
        if (completed) tester.ironcladCompleted += 1;
      } else if (vendor === "sirion") {
        tester.sirionTotal += 1;
        if (completed) tester.sirionCompleted += 1;
      }
    }
    activeAssignmentsByTester.set(row.tester_id, (activeAssignmentsByTester.get(row.tester_id) ?? 0) + 1);
    if (started) {
      startedAssignments += 1;
      startedByTester.set(row.tester_id, true);
    }
    if (completed) {
      completedAssignments += 1;
      completedByTester.set(row.tester_id, (completedByTester.get(row.tester_id) ?? 0) + 1);
    }

    const vendorRow = byVendor.get(vendor) ?? { vendorSlug: vendor, vendorName: row.vendor_name, completed: 0, total: 0 };
    vendorRow.total += 1;
    if (completed) vendorRow.completed += 1;
    byVendor.set(vendor, vendorRow);

    const areaRow = byArea.get(area) ?? { functionalArea: area, completed: 0, total: 0 };
    areaRow.total += 1;
    if (completed) areaRow.completed += 1;
    byArea.set(area, areaRow);

    const outcomeCounts = outcomesByVendor.get(vendor) ?? new Map<string, number>();
    outcomeCounts.set(status, (outcomeCounts.get(status) ?? 0) + 1);
    outcomesByVendor.set(vendor, outcomeCounts);

    const gradeKey = `${vendor}:${area}`;
    const gradeCounts = gradesByVendorArea.get(gradeKey) ?? new Map<string, number>();
    const grade = row.grade ?? "Missing";
    gradeCounts.set(grade, (gradeCounts.get(grade) ?? 0) + 1);
    gradesByVendorArea.set(gradeKey, gradeCounts);

    if (row.severity) {
      const severityCounts = severitiesByVendor.get(vendor) ?? new Map<string, number>();
      severityCounts.set(row.severity, (severityCounts.get(row.severity) ?? 0) + 1);
      severitiesByVendor.set(vendor, severityCounts);
    }

    const heatmapKey = `${area}:${vendor}`;
    const cell = heatmap.get(heatmapKey) ?? {
      functionalArea: area, vendorName: row.vendor_name, vendorSlug: vendor, total: 0,
      completed: 0, notStarted: 0, inProgress: 0, passing: 0, failed: 0, blocked: 0, retest: 0,
    };
    cell.total += 1;
    if (completed) cell.completed += 1;
    if (status === "Not Started") cell.notStarted += 1;
    if (status === "In Progress") cell.inProgress += 1;
    if (PASSING_STATUSES.includes(status as (typeof PASSING_STATUSES)[number])) cell.passing += 1;
    if (status === "Fail") cell.failed += 1;
    if (status === "Blocked") cell.blocked += 1;
    if (status === "Retest Required") cell.retest += 1;
    heatmap.set(heatmapKey, cell);

    const key = pairKey(row.tester_id, row.test_case_id);
    if (row.preferred_vendor) preferenceByPair.set(key, row.preferred_vendor);
    const paired = pairedResults.get(key) ?? { ironclad: null, sirion: null, preferredVendor: row.preferred_vendor };
    if (vendor === "ironclad") paired.ironclad = row.grade;
    if (vendor === "sirion") paired.sirion = row.grade;
    pairedResults.set(key, paired);

    const reasons: string[] = [];
    if (status === "Fail" && row.severity === "Critical") reasons.push("Critical failure");
    else if (status === "Fail" && row.severity === "High") reasons.push("High-severity failure");
    if (status === "Blocked") reasons.push("Blocked");
    if (status === "Retest Required") reasons.push("Retest required");
    if (row.improvement_needed) reasons.push("Improvement requested");
    if (row.usability_rating !== null && row.usability_rating <= 2) reasons.push("Low usability rating");
    if (row.configuration_required) reasons.push("Configuration required");
    if (row.vendor_assistance_required) reasons.push("Vendor assistance required");
    if (row.defect_status && !["Resolved", "Closed"].includes(row.defect_status)) reasons.push(`Defect ${row.defect_status.toLowerCase()}`);
    if (reasons.length) {
      attention.push({
        testerName: row.tester_name ?? "Unknown", vendorName: row.vendor_name,
        testCaseId: row.test_case_id, scenario: row.scenario, functionalArea: area,
        status, grade: row.grade, severity: row.severity,
        usabilityRating: row.usability_rating, reasons, defectStatus: row.defect_status,
      });
    }
  }

  const activeTesterRows = Array.from(byTester.values());
  for (const preferredVendor of preferenceByPair.values()) {
    preferences.set(preferredVendor, (preferences.get(preferredVendor) ?? 0) + 1);
  }
  const startedTesters = activeTesterRows.filter((tester) => tester.started).length;
  const assignedTesters = activeTesterRows.filter((tester) => tester.total > 0);
  const notStartedTesters = assignedTesters.filter((tester) => !tester.started).length;
  const completedAllTesters = assignedTesters.filter((tester) => tester.completed === tester.total).length;
  const unassignedTesters = activeTesterRows.filter((tester) => tester.total === 0).length;
  const grades = Array.from(gradesByVendorArea, ([key, counts]) => {
    const [vendorSlug, functionalArea] = key.split(":");
    return { vendorSlug, functionalArea, counts: GRADE_ORDER.map((grade) => ({ grade, count: counts.get(grade) ?? 0 })) };
  }).sort((a, b) => a.functionalArea.localeCompare(b.functionalArea) || a.vendorSlug.localeCompare(b.vendorSlug));

  const gradeRank: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
  const comparisonGradeCounts = { ironcladHigher: 0, sirionHigher: 0, same: 0, unavailable: 0 };
  for (const pair of pairedResults.values()) {
    if (pair.ironclad && pair.sirion && gradeRank[pair.ironclad] && gradeRank[pair.sirion]) {
      if (gradeRank[pair.ironclad] > gradeRank[pair.sirion]) comparisonGradeCounts.ironcladHigher += 1;
      else if (gradeRank[pair.sirion] > gradeRank[pair.ironclad]) comparisonGradeCounts.sirionHigher += 1;
      else comparisonGradeCounts.same += 1;
    } else comparisonGradeCounts.unavailable += 1;
  }

  return {
    byTester: activeTesterRows.sort((a, b) => a.testerName.localeCompare(b.testerName)),
    byVendor: Array.from(byVendor.values()).sort((a, b) => a.vendorName.localeCompare(b.vendorName)),
    byFunctionalArea: Array.from(byArea.values()).sort((a, b) => a.functionalArea.localeCompare(b.functionalArea)),
    participation: {
      activeTesters: activeTesterRows.length,
      startedTesters,
      notStartedTesters,
      completedAllTesters,
      unassignedTesters,
      assignedTesters: assignedTesters.length,
      totalAssignments: assignmentsResult.rows.length,
      startedAssignments,
      completedAssignments,
      testers: activeTesterRows.map((tester) => ({
        ...tester,
        state: tester.total === 0 ? "Unassigned" as const : tester.started ? "Started" as const : "Not started" as const,
        completedAll: tester.total > 0 && tester.completed === tester.total,
      })),
    },
    outcomesByVendor: Array.from(outcomesByVendor, ([vendorSlug, counts]) => ({
      vendorSlug,
      counts: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => ({ status, count })),
    })).sort((a, b) => a.vendorSlug.localeCompare(b.vendorSlug)),
    grades,
    severitiesByVendor: Array.from(severitiesByVendor, ([vendorSlug, counts]) => ({
      vendorSlug,
      counts: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([severity, count]) => ({ severity, count })),
    })).sort((a, b) => a.vendorSlug.localeCompare(b.vendorSlug)),
    heatmap: Array.from(heatmap.values()).sort((a, b) => a.functionalArea.localeCompare(b.functionalArea) || a.vendorName.localeCompare(b.vendorName)),
    vendorComparison: {
      preferences: [...preferences].sort(([a], [b]) => a.localeCompare(b)).map(([preferredVendor, count]) => ({ preferredVendor, count })),
      pairedGrades: comparisonGradeCounts,
    },
    attention: attention.sort((a, b) => {
      const severityRank = (value: string | null) => value === "Critical" ? 0 : value === "High" ? 1 : value === "Medium" ? 2 : 3;
      return severityRank(a.severity) - severityRank(b.severity) || a.testCaseId.localeCompare(b.testCaseId);
    }),
    definitions: { completedStatuses: COMPLETED_STATUSES, gradeOrder: GRADE_ORDER },
  };
}