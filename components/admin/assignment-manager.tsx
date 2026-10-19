"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  applyPersonaDefaultsAction,
  applyPersonaDefaultsToTestersAction,
  createPersonaAction,
  setPersonaTestCasesAction,
  setTesterCasesAction,
  setTesterPersonaAction,
} from "@/app/actions/admin/assignments";
import type { AdminAssignmentOverview } from "@/lib/data/adminAssignments";

const NONE = "__none__";
const ALL_AREAS = "__all__";

type CaseRow = AdminAssignmentOverview["testCases"][number];
type TesterRow = AdminAssignmentOverview["testers"][number];
type PersonaRow = AdminAssignmentOverview["personas"][number];

export function AssignmentManager({ overview }: { overview: AdminAssignmentOverview }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"testers" | "personas">("testers");
  const [personas, setPersonas] = useState<PersonaRow[]>(overview.personas);
  const [personaCaseIds, setPersonaCaseIds] = useState<Record<string, string[]>>(overview.personaCaseIds);
  const [draftPersonaCaseIds, setDraftPersonaCaseIds] = useState<Record<string, string[]>>(overview.personaCaseIds);
  const [testerPersonaIds, setTesterPersonaIds] = useState<Record<string, string | null>>(
    Object.fromEntries(overview.testers.map((tester) => [tester.id, tester.personaId])),
  );
  const [testerCaseIds, setTesterCaseIds] = useState<Record<string, string[]>>(overview.testerCaseIds);
  const [selectedTesterId, setSelectedTesterId] = useState(overview.testers.find((tester) => tester.isActive)?.id ?? "");
  const [selectedPersonaId, setSelectedPersonaId] = useState(overview.personas[0]?.id ?? "");
  const [newPersonaName, setNewPersonaName] = useState("");
  const [personaArea, setPersonaArea] = useState(ALL_AREAS);
  const [testerArea, setTesterArea] = useState(ALL_AREAS);
  const [personaSearch, setPersonaSearch] = useState("");
  const [testerSearch, setTesterSearch] = useState("");
  const [testerListSearch, setTesterListSearch] = useState("");
  const [testerSort, setTesterSort] = useState<"name" | "persona" | "assignments" | "progress">("name");
  const [caseSort, setCaseSort] = useState<"id" | "area" | "scenario">("id");
  const [bulkTesterIds, setBulkTesterIds] = useState<string[]>([]);
  const [draftAssignedIds, setDraftAssignedIds] = useState<string[]>(overview.testerCaseIds[selectedTesterId] ?? []);
  const [isPending, startTransition] = useTransition();

  const areas = useMemo(() => Array.from(new Set(overview.testCases.map((testCase) => testCase.functionalArea))).sort(), [overview.testCases]);
  const activeTesters = overview.testers.filter((tester) => tester.isActive);
  const selectedTester = activeTesters.find((tester) => tester.id === selectedTesterId) ?? null;
  const assignedSet = new Set(draftAssignedIds);

  const filteredTesters = overview.testers
    .filter((tester) => !testerListSearch || `${tester.name} ${tester.email ?? ""} ${tester.persona ?? ""}`.toLowerCase().includes(testerListSearch.toLowerCase()))
    .sort((left, right) => {
      if (testerSort === "persona") return (left.persona ?? "").localeCompare(right.persona ?? "") || left.name.localeCompare(right.name);
      if (testerSort === "assignments") return right.assignedCaseCount - left.assignedCaseCount || left.name.localeCompare(right.name);
      if (testerSort === "progress") {
        const leftProgress = left.totalAssignments ? left.completedAssignments / left.totalAssignments : 0;
        const rightProgress = right.totalAssignments ? right.completedAssignments / right.totalAssignments : 0;
        return rightProgress - leftProgress || left.name.localeCompare(right.name);
      }
      return left.name.localeCompare(right.name);
    });
  const filteredPersonaCases = overview.testCases.filter((testCase) =>
    testCase.isActive &&
    (personaArea === ALL_AREAS || testCase.functionalArea === personaArea) &&
    (!personaSearch || `${testCase.testCaseId} ${testCase.scenario}`.toLowerCase().includes(personaSearch.toLowerCase())),
  ).sort((left, right) => compareCases(left, right, caseSort));
  const filteredTesterCases = overview.testCases.filter((testCase) =>
    (testCase.isActive || assignedSet.has(testCase.id)) &&
    (testerArea === ALL_AREAS || testCase.functionalArea === testerArea) &&
    (!testerSearch || `${testCase.testCaseId} ${testCase.scenario}`.toLowerCase().includes(testerSearch.toLowerCase())),
  ).sort((left, right) => compareCases(left, right, caseSort));
  const personaSet = new Set(selectedPersonaId ? draftPersonaCaseIds[selectedPersonaId] ?? [] : []);
  const testerSummary = selectedTester ? overview.testers.find((tester) => tester.id === selectedTester.id) : null;

  function run(task: () => Promise<void>) {
    startTransition(async () => {
      try {
        await task();
        router.refresh();
      } catch {
        toast.error("Could not save assignment changes. Please try again.");
      }
    });
  }

  function createPersona() {
    run(async () => {
      const response = await createPersonaAction({ name: newPersonaName });
      if (!response.ok) throw new Error(response.error);
      const persona = response.data;
      setPersonas((current) => current.some((item) => item.id === persona.id) ? current : [...current, persona].sort((a, b) => a.name.localeCompare(b.name)));
      setPersonaCaseIds((current) => ({ ...current, [persona.id]: current[persona.id] ?? [] }));
      setDraftPersonaCaseIds((current) => ({ ...current, [persona.id]: current[persona.id] ?? [] }));
      setSelectedPersonaId(persona.id);
      setNewPersonaName("");
      toast.success(`Persona “${persona.name}” is ready to configure.`);
    });
  }

  function togglePersonaCase(testCase: CaseRow, included: boolean) {
    if (!selectedPersonaId) return;
    setDraftPersonaCaseIds((current) => {
      const next = new Set(current[selectedPersonaId] ?? []);
      if (included) next.add(testCase.id);
      else next.delete(testCase.id);
      return { ...current, [selectedPersonaId]: [...next] };
    });
  }

  function selectVisiblePersonaCases(included: boolean) {
    if (!selectedPersonaId) return;
    const ids = filteredPersonaCases.map((testCase) => testCase.id);
    setDraftPersonaCaseIds((current) => {
      const next = new Set(current[selectedPersonaId] ?? []);
      for (const id of ids) {
        if (included) next.add(id);
        else next.delete(id);
      }
      return { ...current, [selectedPersonaId]: [...next] };
    });
  }

  function savePersonaDefaults() {
    if (!selectedPersonaId) return;
    run(async () => {
      const saved = new Set(personaCaseIds[selectedPersonaId] ?? []);
      const draft = new Set(draftPersonaCaseIds[selectedPersonaId] ?? []);
      const addIds = [...draft].filter((id) => !saved.has(id));
      const removeIds = [...saved].filter((id) => !draft.has(id));
      if (addIds.length) {
        const response = await setPersonaTestCasesAction({ personaId: selectedPersonaId, testCaseIds: addIds, included: true });
        if (!response.ok) throw new Error(response.error);
      }
      if (removeIds.length) {
        const response = await setPersonaTestCasesAction({ personaId: selectedPersonaId, testCaseIds: removeIds, included: false });
        if (!response.ok) throw new Error(response.error);
      }
      setPersonaCaseIds((current) => ({ ...current, [selectedPersonaId]: [...draft] }));
      toast.success(`Persona defaults saved: ${addIds.length} added, ${removeIds.length} removed.`);
    });
  }

  function changeTester(testerId: string) {
    setSelectedTesterId(testerId);
    setDraftAssignedIds(testerCaseIds[testerId] ?? []);
    setTesterArea(ALL_AREAS);
    setTesterSearch("");
  }

  function changeTesterPersona(tester: TesterRow, personaId: string) {
    if (personaId === NONE) return;
    const nextId = personaId;
    run(async () => {
      const response = await setTesterPersonaAction({ testerId: tester.id, personaId: nextId });
      if (!response.ok) throw new Error(response.error);
      setTesterPersonaIds((current) => ({ ...current, [tester.id]: nextId }));
      toast.success("Tester persona updated.");
    });
  }

  function toggleDraftCase(testCaseId: string) {
    setDraftAssignedIds((current) => current.includes(testCaseId) ? current.filter((id) => id !== testCaseId) : [...current, testCaseId]);
  }

  function setVisibleCases(checked: boolean) {
    const ids = filteredTesterCases.filter((testCase) => checked ? testCase.isActive : true).map((testCase) => testCase.id);
    setDraftAssignedIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return [...next];
    });
  }

  function applyDefaults() {
    if (!selectedTester) return;
    run(async () => {
      const response = await applyPersonaDefaultsAction(selectedTester.id);
      if (!response.ok) throw new Error(response.error);
      const defaults = personaCaseIds[testerPersonaIds[selectedTester.id] ?? ""] ?? [];
      setDraftAssignedIds((current) => [...new Set([...current, ...defaults])]);
      setTesterCaseIds((current) => ({ ...current, [selectedTester.id]: [...new Set([...(current[selectedTester.id] ?? []), ...defaults])] }));
      toast.success("Persona defaults added. Existing evaluations were preserved.");
    });
  }

  function toggleBulkTester(testerId: string, selected: boolean) {
    setBulkTesterIds((current) => selected
      ? [...new Set([...current, testerId])]
      : current.filter((id) => id !== testerId));
  }

  function selectVisibleTesters(selected: boolean) {
    const visibleActiveIds = filteredTesters.filter((tester) => tester.isActive).map((tester) => tester.id);
    setBulkTesterIds((current) => selected
      ? [...new Set([...current, ...visibleActiveIds])]
      : current.filter((id) => !visibleActiveIds.includes(id)));
  }

  function applyDefaultsToSelectedTesters() {
    const selectedIds = bulkTesterIds.filter((id) => activeTesters.some((tester) => tester.id === id));
    if (!selectedIds.length) return;
    run(async () => {
      const response = await applyPersonaDefaultsToTestersAction(selectedIds);
      if (!response.ok) throw new Error(response.error);
      const addedByTester = new Map<string, string[]>();
      for (const testerId of selectedIds) {
        const personaId = testerPersonaIds[testerId];
        if (personaId) addedByTester.set(testerId, personaCaseIds[personaId] ?? []);
      }
      setTesterCaseIds((current) => {
        const next = { ...current };
        for (const [testerId, caseIds] of addedByTester) {
          next[testerId] = [...new Set([...(next[testerId] ?? []), ...caseIds])];
        }
        return next;
      });
      if (selectedTesterId && addedByTester.has(selectedTesterId)) {
        setDraftAssignedIds((current) => [...new Set([...current, ...(addedByTester.get(selectedTesterId) ?? [])])]);
      }
      toast.success(`Persona defaults applied to ${response.data.testersApplied} testers; ${response.data.casesAdded} tester-case pairs added. ${response.data.testersSkipped} skipped (no configured defaults).`);
      setBulkTesterIds([]);
    });
  }

  function saveTesterAssignments() {
    if (!selectedTester) return;
    run(async () => {
      const current = new Set(testerCaseIds[selectedTester.id] ?? []);
      const desired = new Set(draftAssignedIds);
      const addIds = [...desired].filter((id) => !current.has(id));
      const removeIds = [...current].filter((id) => !desired.has(id));
      if (addIds.length) {
        const response = await setTesterCasesAction({ testerId: selectedTester.id, testCaseIds: addIds, assigned: true });
        if (!response.ok) throw new Error(response.error);
      }
      if (removeIds.length) {
        const response = await setTesterCasesAction({ testerId: selectedTester.id, testCaseIds: removeIds, assigned: false });
        if (!response.ok) throw new Error(response.error);
      }
      setTesterCaseIds((all) => ({ ...all, [selectedTester.id]: [...desired] }));
      toast.success(`Assignments saved: ${addIds.length} added, ${removeIds.length} removed. Existing evaluation data is retained.`);
    });
  }

  function selectTesterRow(tester: TesterRow) {
    if (tester.isActive) changeTester(tester.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex w-fit gap-1 border-b border-border" role="tablist" aria-label="Assignment administration">
        <button type="button" role="tab" id="assignments-tab-testers" aria-controls="assignments-panel-testers" aria-selected={activeTab === "testers"} onClick={() => setActiveTab("testers")} className={`border-b-2 px-4 py-2 text-sm font-semibold ${activeTab === "testers" ? "border-primary text-primary" : "border-transparent text-foreground-muted hover:text-foreground"}`}>Testers</button>
        <button type="button" role="tab" id="assignments-tab-personas" aria-controls="assignments-panel-personas" aria-selected={activeTab === "personas"} onClick={() => setActiveTab("personas")} className={`border-b-2 px-4 py-2 text-sm font-semibold ${activeTab === "personas" ? "border-primary text-primary" : "border-transparent text-foreground-muted hover:text-foreground"}`}>Personas</button>
      </div>

      <Card id="assignments-panel-personas" role="tabpanel" aria-labelledby="assignments-tab-personas" hidden={activeTab !== "personas"}>
        <CardHeader>
          <CardTitle className="text-base">Persona defaults</CardTitle>
          <CardDescription>Define reusable test-case sets by persona. Applying defaults adds cases; it never removes existing assignments.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 gap-2">
              <Input aria-label="New persona name" placeholder="Define a persona" value={newPersonaName} onChange={(event) => setNewPersonaName(event.target.value)} />
              <Button type="button" onClick={createPersona} disabled={isPending || !newPersonaName.trim()}>Add persona</Button>
            </div>
            <Select value={selectedPersonaId || NONE} onValueChange={(value) => {
              const id = value === NONE ? "" : value;
              setSelectedPersonaId(id);
              if (id) setDraftPersonaCaseIds((current) => ({ ...current, [id]: [...(personaCaseIds[id] ?? [])] }));
            }}>
              <SelectTrigger className="sm:w-72"><SelectValue placeholder="Select persona defaults" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Select persona</SelectItem>
                {personas.map((persona) => <SelectItem key={persona.id} value={persona.id}>{persona.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selectedPersonaId ? (
            <>
              <div className="flex flex-col gap-3 lg:flex-row">
                <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" /><Input className="pl-9" placeholder="Search test cases" value={personaSearch} onChange={(event) => setPersonaSearch(event.target.value)} /></div>
                <select aria-label="Filter persona cases by area" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={personaArea} onChange={(event) => setPersonaArea(event.target.value)}><option value={ALL_AREAS}>All functional areas</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}</select>
                <select aria-label="Sort persona test cases" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={caseSort} onChange={(event) => setCaseSort(event.target.value as typeof caseSort)}><option value="id">Sort: case ID</option><option value="area">Sort: functional area</option><option value="scenario">Sort: scenario</option></select>
                <Button type="button" variant="outline" onClick={() => selectVisiblePersonaCases(filteredPersonaCases.some((testCase) => !personaSet.has(testCase.id)))} disabled={isPending || filteredPersonaCases.length === 0}>
                  {filteredPersonaCases.length > 0 && filteredPersonaCases.every((testCase) => personaSet.has(testCase.id)) ? "Deselect all visible" : "Select all visible"} ({filteredPersonaCases.length})
                </Button>
                <Button type="button" onClick={savePersonaDefaults} disabled={isPending || sameIds([...personaSet], personaCaseIds[selectedPersonaId] ?? [])}>{isPending ? "Saving…" : "Save defaults"}</Button>
              </div>
              <div className="max-h-72 overflow-auto rounded-md border border-border">
                <Table className="min-w-[760px]">
                  <TableHeader><TableRow><TableHead>Default</TableHead><TableHead>Test Case</TableHead><TableHead>Functional Area</TableHead><TableHead>Scenario</TableHead></TableRow></TableHeader>
                  <TableBody>{filteredPersonaCases.map((testCase) => <TableRow key={testCase.id} onClick={() => togglePersonaCase(testCase, !personaSet.has(testCase.id))} className="cursor-pointer">
                    <TableCell><input type="checkbox" aria-label={`Include ${testCase.testCaseId} in persona`} checked={personaSet.has(testCase.id)} onChange={(event) => togglePersonaCase(testCase, event.target.checked)} onClick={(event) => event.stopPropagation()} /></TableCell>
                    <TableCell className="font-medium">{testCase.testCaseId}</TableCell><TableCell>{testCase.functionalArea}</TableCell><TableCell className="max-w-96 truncate" title={testCase.scenario}>{testCase.scenario}</TableCell>
                  </TableRow>)}</TableBody>
                </Table>
              </div>
              <p className="text-xs text-foreground-muted">{personaSet.size} default cases selected. Choose a functional area to focus the list, or search across all cases.</p>
            </>
          ) : <div className="rounded-md border border-dashed border-border p-6 text-sm text-foreground-muted">Create or select a persona to configure its default test cases.</div>}
        </CardContent>
      </Card>

      <Card id="assignments-panel-testers" role="tabpanel" aria-labelledby="assignments-tab-testers" hidden={activeTab !== "testers"}>
        <CardHeader>
          <CardTitle className="text-base">Tester assignments</CardTitle>
          <CardDescription>Select a tester to review current assignments, apply persona defaults, and make individual overrides. Removing a case hides it from the tester workspace but preserves saved evaluations.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" /><Input aria-label="Search testers" className="pl-9" placeholder="Search name, email, or persona" value={testerListSearch} onChange={(event) => setTesterListSearch(event.target.value)} /></div>
            <select aria-label="Sort testers" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={testerSort} onChange={(event) => setTesterSort(event.target.value as typeof testerSort)}><option value="name">Sort: name</option><option value="persona">Sort: persona</option><option value="assignments">Sort: assigned cases</option><option value="progress">Sort: completion</option></select>
            <Button type="button" variant="outline" onClick={() => selectVisibleTesters(filteredTesters.some((tester) => tester.isActive && !bulkTesterIds.includes(tester.id)))} disabled={isPending || !filteredTesters.some((tester) => tester.isActive)}>{filteredTesters.some((tester) => tester.isActive && !bulkTesterIds.includes(tester.id)) ? "Select visible" : "Clear visible"}</Button>
            <Button type="button" onClick={applyDefaultsToSelectedTesters} disabled={isPending || bulkTesterIds.length === 0}>Apply persona defaults ({bulkTesterIds.length})</Button>
          </div>
          <div className="overflow-auto rounded-md border border-border">
            <Table className="min-w-[850px]">
              <TableHeader><TableRow><TableHead>Select</TableHead><TableHead>Tester</TableHead><TableHead>Persona</TableHead><TableHead>Assigned cases</TableHead><TableHead>Evaluation progress</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{filteredTesters.map((tester) => {
                const personaId = testerPersonaIds[tester.id] ?? NONE;
                const percent = testerSummary && tester.id === testerSummary.id && testerSummary.totalAssignments ? Math.round(testerSummary.completedAssignments / testerSummary.totalAssignments * 100) : tester.totalAssignments ? Math.round(tester.completedAssignments / tester.totalAssignments * 100) : 0;
                return <TableRow key={tester.id} className={`${tester.isActive ? "cursor-pointer" : "opacity-60"} ${selectedTesterId === tester.id ? "bg-surface" : ""}`} onClick={() => selectTesterRow(tester)} aria-selected={selectedTesterId === tester.id}>
                  <TableCell onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${tester.name} for bulk persona assignment`} checked={bulkTesterIds.includes(tester.id)} disabled={!tester.isActive || isPending} onChange={(event) => toggleBulkTester(tester.id, event.target.checked)} /></TableCell>
                  <TableCell className="font-medium"><span className="inline-flex items-center gap-2"><UserRound className="size-4 text-foreground-muted" />{tester.name}</span>{tester.email ? <div className="pl-6 text-xs text-foreground-muted">{tester.email}</div> : null}</TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}><Select value={personaId} onValueChange={(value) => changeTesterPersona(tester, value)} disabled={!tester.isActive || isPending || personas.length === 0}><SelectTrigger className="w-56"><SelectValue placeholder="Select required persona" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Assign persona…</SelectItem>{personas.map((persona) => <SelectItem key={persona.id} value={persona.id}>{persona.name}</SelectItem>)}</SelectContent></Select></TableCell>
                  <TableCell><Badge variant="outline">{tester.assignedCaseCount}</Badge></TableCell>
                  <TableCell className="min-w-64"><div className="flex items-center gap-3"><Progress value={percent} className="max-w-48" /><span className="whitespace-nowrap text-xs text-foreground-muted">{tester.completedAssignments}/{tester.totalAssignments} vendor evaluations</span></div></TableCell>
                  <TableCell><Badge variant={tester.isActive ? "success" : "outline"}>{tester.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                </TableRow>;
              })}{filteredTesters.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-foreground-muted">No testers match your search.</TableCell></TableRow> : null}</TableBody>
            </Table>
          </div>

          {selectedTester ? (
            <section className="flex flex-col gap-4 border-t border-border pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-semibold">Assign cases to {selectedTester.name}</h3><p className="text-sm text-foreground-muted">{draftAssignedIds.length} cases selected · {draftAssignedIds.length * 2} vendor assignments</p></div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={applyDefaults} disabled={isPending || !testerPersonaIds[selectedTester.id]}>Apply persona defaults <ChevronRight /></Button>
                  <Button type="button" onClick={saveTesterAssignments} disabled={isPending || sameIds(draftAssignedIds, testerCaseIds[selectedTester.id] ?? [])}>{isPending ? "Saving…" : "Save assignments"}</Button>
                </div>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row">
                <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" /><Input className="pl-9" placeholder="Search test cases" value={testerSearch} onChange={(event) => setTesterSearch(event.target.value)} /></div>
                <select aria-label="Filter tester cases by area" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={testerArea} onChange={(event) => setTesterArea(event.target.value)}><option value={ALL_AREAS}>All functional areas</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}</select>
                <select aria-label="Sort test cases" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={caseSort} onChange={(event) => setCaseSort(event.target.value as typeof caseSort)}><option value="id">Sort: case ID</option><option value="area">Sort: functional area</option><option value="scenario">Sort: scenario</option></select>
                <Button type="button" variant="outline" onClick={() => setVisibleCases(true)}>Select visible ({filteredTesterCases.length})</Button>
                <Button type="button" variant="outline" onClick={() => setVisibleCases(false)}>Clear visible</Button>
              </div>
              <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
                <Table className="min-w-[820px]">
                  <TableHeader><TableRow><TableHead>Assign</TableHead><TableHead>Test Case</TableHead><TableHead>Functional Area</TableHead><TableHead>Scenario</TableHead></TableRow></TableHeader>
                  <TableBody>{filteredTesterCases.map((testCase) => <TableRow key={testCase.id} className={testCase.isActive || assignedSet.has(testCase.id) ? "cursor-pointer" : "opacity-60"} onClick={() => { if (testCase.isActive || assignedSet.has(testCase.id)) toggleDraftCase(testCase.id); }}>
                    <TableCell><input type="checkbox" aria-label={`${testCase.isActive ? "Assign" : "Remove archived case"} ${testCase.testCaseId} ${testCase.isActive ? `to ${selectedTester.name}` : ""}`} checked={assignedSet.has(testCase.id)} disabled={!testCase.isActive && !assignedSet.has(testCase.id)} onChange={() => toggleDraftCase(testCase.id)} onClick={(event) => event.stopPropagation()} /></TableCell>
                    <TableCell className="font-medium">{testCase.testCaseId}{!testCase.isActive ? <span className="ml-2 text-xs text-foreground-muted">Archived</span> : null}</TableCell><TableCell>{testCase.functionalArea}</TableCell><TableCell className="max-w-96 truncate" title={testCase.scenario}>{testCase.scenario}</TableCell>
                  </TableRow>)}</TableBody>
                </Table>
              </div>
              {testerSummary && testerSummary.assignedCaseCount === 0 ? <p className="text-sm text-foreground-muted">No active cases are assigned. Choose cases above or apply persona defaults.</p> : null}
            </section>
          ) : <div className="rounded-md border border-dashed border-border p-6 text-sm text-foreground-muted">Select an active tester to manage their test cases.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const ids = new Set(left);
  return right.every((id) => ids.has(id));
}

function compareCases(left: CaseRow, right: CaseRow, sort: "id" | "area" | "scenario") {
  if (sort === "area") return left.functionalArea.localeCompare(right.functionalArea) || left.testCaseId.localeCompare(right.testCaseId);
  if (sort === "scenario") return left.scenario.localeCompare(right.scenario) || left.testCaseId.localeCompare(right.testCaseId);
  return left.testCaseId.localeCompare(right.testCaseId);
}
