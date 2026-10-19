"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createDefectAction, updateDefectAction } from "@/app/actions/defects";
import { SEVERITY_VALUES } from "@/lib/constants";
import { RequiredMark } from "@/components/ui/required-mark";
import type { Database } from "@/lib/types/database";

type DefectRow = Database["public"]["Tables"]["defects"]["Row"];

export function DefectDialog({
  testResultId,
  vendorId,
  defect,
  onSaved,
}: {
  testResultId: string;
  vendorId: string;
  defect: DefectRow | null;
  onSaved: (defect: DefectRow, resultVersion: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setTitle(defect?.title ?? "");
      setDescription(defect?.description ?? "");
      setSeverity(defect?.severity ?? "");
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error("A defect title is required.");
      return;
    }
    setIsSaving(true);
    const res = defect
      ? await updateDefectAction({ defectId: defect.id, testResultId, vendorId, title, description, severity })
      : await createDefectAction({ testResultId, vendorId, title, description, severity });
    setIsSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onSaved(res.data.defect, res.data.resultVersion);
    toast.success(defect ? `Saved ${res.data.defect.defect_code}.` : `Logged ${res.data.defect.defect_code}.`);
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-2">
      {defect ? <span className="text-sm font-medium">{defect.defect_code}</span> : null}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Bug /> {defect ? "Edit defect" : "Log defect"}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{defect ? `Edit ${defect.defect_code}` : "Log a defect"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="defect-title">Title <RequiredMark /></Label>
              <Input id="defect-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="defect-description">Description</Label>
              <Textarea id="defect-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={10000} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
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
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : defect ? "Save defect" : "Create defect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
