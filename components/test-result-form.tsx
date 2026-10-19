"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CriticalBanner } from "@/components/critical-banner";
import { EvidenceManager } from "@/components/evidence-manager";
import { DefectDialog } from "@/components/defect-dialog";
import { RequiredMark } from "@/components/ui/required-mark";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { saveDraftAction, submitResultAction } from "@/app/actions/testResults";
import {
  getConditionalRequirementErrors,
  type TestResultDraftInput,
} from "@/lib/validation/testResult";
import { GRADE_VALUES, SEVERITY_VALUES, STATUS_VALUES } from "@/lib/constants";
import type { Database } from "@/lib/types/database";

type TestResultRow = Database["public"]["Tables"]["test_results"]["Row"];
type EvidenceRow = Database["public"]["Tables"]["evidence"]["Row"];
type DefectRow = Database["public"]["Tables"]["defects"]["Row"];

export function TestResultForm({
  vendorName,
  assignmentId,
  vendorId,
  result,
  evidence,
  defect,
  evidenceMode,
  onSaved,
}: {
  vendorName: string;
  assignmentId: string;
  vendorId: string;
  result: TestResultRow;
  evidence: EvidenceRow[];
  defect: DefectRow | null;
  evidenceMode: "disabled" | "sharepoint" | "upload";
  onSaved?: () => void;
}) {
  // Keyed by result.id at the call site (see test case page), so a new assignment/result
  // remounts this component with fresh initial state instead of syncing via an effect.
  const initialForm = rowToForm(result);
  const [form, setForm] = useState(initialForm);
  const [evidenceList, setEvidenceList] = useState(evidence);
  const [linkedDefect, setLinkedDefect] = useState(defect);
  const [showGradeDefinitions, setShowGradeDefinitions] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(initialForm);
  const versionRef = useRef(result.version);
  const revisionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);

  useUnsavedChangesWarning(isDirty);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    const nextForm = { ...formRef.current, [key]: value };
    formRef.current = nextForm;
    revisionRef.current += 1;
    setForm(nextForm);
    setIsDirty(true);
    scheduleAutosave();
  }

  function scheduleAutosave(delay = 1500) {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void handleSaveDraft(), delay);
  }

  function buildInput(merged = formRef.current, versionOverride = versionRef.current): TestResultDraftInput {
    return {
      assignmentId,
      version: versionOverride,
      actualResult: merged.actualResult || null,
      featureAdequate: merged.featureAdequate,
      improvementNeeded: merged.improvementNeeded,
      improvementDescription: merged.improvementDescription || null,
      featureUserFriendly: merged.featureUserFriendly,
      status: merged.status,
      grade: merged.grade || null,
      severity: merged.severity || null,
      evidence: evidenceList.length > 0 ? { kind: "file", evidenceId: evidenceList[0].id } : null,
      defectId: merged.defectId || null,
      workaroundNotes: merged.workaroundNotes || null,
      usabilityRating: merged.usabilityRating,
      configurationRequired: merged.configurationRequired,
      vendorAssistanceRequired: merged.vendorAssistanceRequired,
      blockedReason: merged.blockedReason || null,
      blockedOwner: merged.blockedOwner || null,
      blockedTargetDate: merged.blockedTargetDate || null,
    };
  }

  async function handleSaveDraft() {
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return;
    }
    saveInFlightRef.current = true;
    setIsSaving(true);
    const revision = revisionRef.current;
    let saveAgain = false;
    try {
      const res = await saveDraftAction(buildInput());
      if (!res.ok) {
        saveQueuedRef.current = false;
        if (res.code === "CONFLICT") toast.error(res.error);
        return;
      }
      versionRef.current = Math.max(versionRef.current, res.data.version);
      if (revisionRef.current === revision) setIsDirty(false);
      else saveAgain = true;
      onSaved?.();
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
      if (saveAgain || saveQueuedRef.current) {
        saveQueuedRef.current = false;
        scheduleAutosave(0);
      }
    }
  }

  async function handleSubmit() {
    if (saveInFlightRef.current) {
      toast.error("Your draft is still saving. Please submit again in a moment.");
      return;
    }
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const input = buildInput();
    const clientErrors = getConditionalRequirementErrors(input);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      toast.error("Please resolve the highlighted fields before submitting.");
      return;
    }

    setIsSubmitting(true);
    const res = await submitResultAction(input);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      toast.error(res.error);
      return;
    }
    versionRef.current = Math.max(versionRef.current, res.data.version);
    setIsDirty(false);
    onSaved?.();
    toast.success(`${vendorName} result submitted.`);
  }

  const isCritical = form.severity === "Critical" && form.status === "Fail";
  const actualResultRequired = form.status === "Pass" || form.status === "Fail";
  const isBlocked = form.status === "Blocked";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{vendorName} execution</CardTitle>
        {isSaving ? <span className="text-xs text-foreground-muted">Saving…</span> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isCritical ? <CriticalBanner>Critical defect — flagged for immediate attention.</CriticalBanner> : null}

        <Field label="Actual Result" required={actualResultRequired} error={errors.actualResult}>
          <Textarea
            value={form.actualResult ?? ""}
            onChange={(e) => update("actualResult", e.target.value)}
            placeholder="What actually happened when you ran the steps?"
          />
        </Field>

        <section className="grid grid-cols-1 gap-4 rounded-md border border-border bg-surface p-4 md:grid-cols-3" aria-label="Feature evaluation questions">
          <QuestionField label="Is this feature adequate?">
            <YesNoRadio value={form.featureAdequate} onChange={(value) => update("featureAdequate", value)} />
          </QuestionField>
          <QuestionField label="Is improvement needed?" error={errors.improvementDescription}>
            <YesNoRadio
              value={form.improvementNeeded}
              onChange={(value) => {
                const nextForm = {
                  ...formRef.current,
                  improvementNeeded: value,
                  improvementDescription: value ? formRef.current.improvementDescription : null,
                };
                formRef.current = nextForm;
                revisionRef.current += 1;
                setForm(nextForm);
                setIsDirty(true);
                scheduleAutosave();
              }}
            />
          </QuestionField>
          <QuestionField label="Is the feature intuitive and user-friendly?">
            <YesNoRadio value={form.featureUserFriendly} onChange={(value) => update("featureUserFriendly", value)} />
          </QuestionField>
          {form.improvementNeeded === true ? (
            <div className="md:col-span-3">
              <Field label="Describe the required improvements" required error={errors.improvementDescription}>
                <Textarea
                  value={form.improvementDescription ?? ""}
                  onChange={(event) => update("improvementDescription", event.target.value)}
                  placeholder="What should be improved?"
                />
              </Field>
            </div>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Status" required>
            <Select value={form.status} onValueChange={(v) => update("status", v as typeof form.status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Grade"
            required={form.status === "Pass"}
            error={errors.grade}
            labelAction={(
              <div className="relative">
                <button
                  type="button"
                  className="inline-flex size-6 items-center justify-center rounded-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Show grade definitions"
                  aria-expanded={showGradeDefinitions}
                  aria-controls="grade-definitions"
                  title="Show grade definitions"
                  onClick={() => setShowGradeDefinitions((visible) => !visible)}
                  onKeyDown={(event) => { if (event.key === "Escape") setShowGradeDefinitions(false); }}
                >
                  <Eye className="size-4" />
                </button>
                {showGradeDefinitions ? (
                  <div id="grade-definitions" role="dialog" aria-label="Grade definitions" className="absolute right-0 top-7 z-20 w-72 rounded-md border border-border bg-background p-3 text-xs shadow-lg">
                    <div className="mb-2 flex items-center justify-between font-semibold">
                      Grade definitions
                      <button type="button" className="text-foreground-muted hover:text-foreground" onClick={() => setShowGradeDefinitions(false)} aria-label="Close grade definitions">×</button>
                    </div>
                    <dl className="grid grid-cols-[2.5rem_1fr] gap-x-2 gap-y-1">
                      <dt className="font-semibold">A</dt><dd>Fully meets expectations</dd>
                      <dt className="font-semibold">B</dt><dd>Minor observations</dd>
                      <dt className="font-semibold">C</dt><dd>Material workaround required</dd>
                      <dt className="font-semibold">D</dt><dd>Major impairment</dd>
                      <dt className="font-semibold">F</dt><dd>Unusable / control failure</dd>
                      <dt className="font-semibold">N/A</dt><dd>Not graded</dd>
                    </dl>
                  </div>
                ) : null}
              </div>
            )}
          >
            <Select value={form.grade ?? ""} onValueChange={(v) => update("grade", v as typeof form.grade)}>
              <SelectTrigger>
                <SelectValue placeholder="Select grade" />
              </SelectTrigger>
              <SelectContent>
                {GRADE_VALUES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Severity" required={form.status === "Fail"} error={errors.severity}>
            <Select value={form.severity ?? ""} onValueChange={(v) => update("severity", v as typeof form.severity)}>
              <SelectTrigger>
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {form.status === "Blocked" ? (
          <div className="grid grid-cols-1 gap-4 rounded-md border border-border bg-surface p-4 sm:grid-cols-3">
            <Field label="Blocked reason" required={isBlocked} error={errors.blockedReason}>
              <Textarea value={form.blockedReason ?? ""} onChange={(e) => update("blockedReason", e.target.value)} />
            </Field>
            <Field label="Owner" required={isBlocked} error={errors.blockedOwner}>
              <Input value={form.blockedOwner ?? ""} onChange={(e) => update("blockedOwner", e.target.value)} />
            </Field>
            <Field label="Target date" required={isBlocked} error={errors.blockedTargetDate}>
              <Input
                type="date"
                value={form.blockedTargetDate ?? ""}
                onChange={(e) => update("blockedTargetDate", e.target.value)}
              />
            </Field>
          </div>
        ) : null}

        {evidenceMode !== "disabled" ? (
          <Field label="Evidence (optional)" error={errors.evidence}>
            <EvidenceManager
              testResultId={result.id}
              evidence={evidenceList}
              mode={evidenceMode}
              onAdded={(e) => {
                setEvidenceList((prev) => [e, ...prev]);
                setIsDirty(true);
              }}
            />
          </Field>
        ) : null}

        <Field label="Defect" required={form.status === "Fail"} error={errors.defectId}>
          <DefectDialog
            testResultId={result.id}
            vendorId={vendorId}
            defect={linkedDefect}
            onSaved={(savedDefect, resultVersion) => {
              if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
              setLinkedDefect(savedDefect);
              const nextForm = { ...formRef.current, defectId: savedDefect.id };
              formRef.current = nextForm;
              revisionRef.current += 1;
              setForm(nextForm);
              versionRef.current = Math.max(versionRef.current, resultVersion);
              setIsDirty(true);
              scheduleAutosave();
            }}
          />
        </Field>

        <Field label="Workaround / Notes">
          <Textarea value={form.workaroundNotes ?? ""} onChange={(e) => update("workaroundNotes", e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field label="Usability rating (1–5)">
            <RadioGroup
              className="flex gap-2"
              value={form.usabilityRating ? String(form.usabilityRating) : ""}
              onValueChange={(v) => update("usabilityRating", Number(v))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex items-center gap-1 text-sm">
                  <RadioGroupItem value={String(n)} /> {n}
                </label>
              ))}
            </RadioGroup>
          </Field>
          <Field label="Configuration required">
            <YesNoRadio value={form.configurationRequired} onChange={(v) => update("configurationRequired", v)} />
          </Field>
          <Field label="Vendor assistance required">
            <YesNoRadio value={form.vendorAssistanceRequired} onChange={(v) => update("vendorAssistanceRequired", v)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 text-sm text-foreground-muted sm:grid-cols-3">
          <div>
            <span className="font-medium text-foreground">Started:</span>{" "}
            {result.started_at ? new Date(result.started_at).toLocaleString() : "Not started"}
          </div>
          <div>
            <span className="font-medium text-foreground">Completed:</span>{" "}
            {result.completed_at ? new Date(result.completed_at).toLocaleString() : "In progress"}
          </div>
          <div>
            <span className="font-medium text-foreground">Duration:</span> {formatDuration(result)}
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" onClick={() => void handleSaveDraft()} disabled={isSaving}>
          Save draft
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting || isSaving}>
          {isSubmitting ? "Submitting…" : `Submit ${vendorName} result`}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Field({ label, required = false, labelAction, error, children }: {
  label: string;
  required?: boolean;
  labelAction?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-5 items-center gap-1">
        <Label>{label}{required ? <RequiredMark /> : null}</Label>
        {labelAction}
      </div>
      {children}
      {error ? <p className="text-xs text-critical">{error}</p> : null}
    </div>
  );
}

function QuestionField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label className="leading-snug">{label}</Label>
      {children}
      {error ? <p className="text-xs text-critical">{error}</p> : null}
    </div>
  );
}

function YesNoRadio({ value, onChange }: { value: boolean | null | undefined; onChange: (v: boolean) => void }) {
  return (
    <RadioGroup
      className="flex gap-4"
      value={value == null ? "" : value ? "yes" : "no"}
      onValueChange={(v) => onChange(v === "yes")}
    >
      <label className="flex items-center gap-1.5 text-sm">
        <RadioGroupItem value="yes" /> Yes
      </label>
      <label className="flex items-center gap-1.5 text-sm">
        <RadioGroupItem value="no" /> No
      </label>
    </RadioGroup>
  );
}

function formatDuration(result: TestResultRow): string {
  if (!result.started_at || !result.completed_at) return "—";
  const ms = new Date(result.completed_at).getTime() - new Date(result.started_at).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function rowToForm(result: TestResultRow) {
  return {
    actualResult: result.actual_result,
    featureAdequate: result.feature_adequate ?? null,
    improvementNeeded: result.improvement_needed ?? null,
    improvementDescription: result.improvement_description ?? null,
    featureUserFriendly: result.feature_user_friendly ?? null,
    status: result.status as (typeof STATUS_VALUES)[number],
    grade: result.grade as (typeof GRADE_VALUES)[number] | null,
    severity: result.severity as (typeof SEVERITY_VALUES)[number] | null,
    defectId: result.defect_id,
    workaroundNotes: result.workaround_notes,
    usabilityRating: result.usability_rating,
    configurationRequired: result.configuration_required,
    vendorAssistanceRequired: result.vendor_assistance_required,
    blockedReason: result.blocked_reason,
    blockedOwner: result.blocked_owner,
    blockedTargetDate: result.blocked_target_date,
  };
}
