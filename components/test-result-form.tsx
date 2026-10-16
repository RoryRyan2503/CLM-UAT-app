"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
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

export function TestResultForm({
  vendorName,
  assignmentId,
  vendorId,
  result,
  evidence,
  evidenceEnabled,
  onSaved,
}: {
  vendorName: string;
  assignmentId: string;
  vendorId: string;
  result: TestResultRow;
  evidence: EvidenceRow[];
  evidenceEnabled: boolean;
  onSaved?: () => void;
}) {
  // Keyed by result.id at the call site (see test case page), so a new assignment/result
  // remounts this component with fresh initial state instead of syncing via an effect.
  const [form, setForm] = useState(rowToForm(result));
  const [version, setVersion] = useState(result.version);
  const [evidenceList, setEvidenceList] = useState(evidence);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useUnsavedChangesWarning(isDirty);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void handleSaveDraft({ ...form, [key]: value }), 1500);
  }

  function buildInput(overrides?: Partial<typeof form>): TestResultDraftInput {
    const merged = { ...form, ...overrides };
    return {
      assignmentId,
      version,
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

  async function handleSaveDraft(overrideForm?: typeof form) {
    setIsSaving(true);
    const input = overrideForm ? buildInput(overrideForm) : buildInput();
    const res = await saveDraftAction(input);
    setIsSaving(false);
    if (!res.ok) {
      if (res.code === "CONFLICT") toast.error(res.error);
      return;
    }
    setVersion(res.data.version);
    setIsDirty(false);
    onSaved?.();
  }

  async function handleSubmit() {
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
    setVersion(res.data.version);
    setIsDirty(false);
    onSaved?.();
    toast.success(`${vendorName} result submitted.`);
  }

  const isCritical = form.severity === "Critical" && form.status === "Fail";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{vendorName} execution</CardTitle>
        {isSaving ? <span className="text-xs text-foreground-muted">Saving…</span> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isCritical ? <CriticalBanner>Critical defect — flagged for immediate attention.</CriticalBanner> : null}

        <Field label="Actual Result" error={errors.actualResult}>
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
                setForm((previous) => ({
                  ...previous,
                  improvementNeeded: value,
                  improvementDescription: value ? previous.improvementDescription : null,
                }));
                setIsDirty(true);
                if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
                const nextForm = {
                  ...form,
                  improvementNeeded: value,
                  improvementDescription: value ? form.improvementDescription : null,
                };
                autosaveTimer.current = setTimeout(() => void handleSaveDraft(nextForm), 1500);
              }}
            />
          </QuestionField>
          <QuestionField label="Is the feature intuitive and user-friendly?">
            <YesNoRadio value={form.featureUserFriendly} onChange={(value) => update("featureUserFriendly", value)} />
          </QuestionField>
          {form.improvementNeeded === true ? (
            <div className="md:col-span-3">
              <Field label="Describe the required improvements" error={errors.improvementDescription}>
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
          <Field label="Status">
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
          <Field label="Grade" error={errors.grade}>
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
          <Field label="Severity" error={errors.severity}>
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
            <Field label="Blocked reason" error={errors.blockedReason}>
              <Textarea value={form.blockedReason ?? ""} onChange={(e) => update("blockedReason", e.target.value)} />
            </Field>
            <Field label="Owner" error={errors.blockedOwner}>
              <Input value={form.blockedOwner ?? ""} onChange={(e) => update("blockedOwner", e.target.value)} />
            </Field>
            <Field label="Target date" error={errors.blockedTargetDate}>
              <Input
                type="date"
                value={form.blockedTargetDate ?? ""}
                onChange={(e) => update("blockedTargetDate", e.target.value)}
              />
            </Field>
          </div>
        ) : null}

        {evidenceEnabled ? (
          <Field label="Evidence (optional)" error={errors.evidence}>
            <EvidenceManager
              testResultId={result.id}
              evidence={evidenceList}
              onAdded={(e) => {
                setEvidenceList((prev) => [e, ...prev]);
                setIsDirty(true);
              }}
            />
          </Field>
        ) : null}

        <Field label="Defect" error={errors.defectId}>
          <DefectDialog
            testResultId={result.id}
            vendorId={vendorId}
            onCreated={(defectId) => update("defectId", defectId)}
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
        <Button variant="outline" onClick={() => handleSaveDraft()} disabled={isSaving}>
          Save draft
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Submitting…" : `Submit ${vendorName} result`}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
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
