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
import { createDefectAction } from "@/app/actions/defects";
import { SEVERITY_VALUES } from "@/lib/constants";

export function DefectDialog({
  testResultId,
  vendorId,
  onCreated,
}: {
  testResultId: string;
  vendorId: string;
  onCreated: (defectId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<string>("");
  const [defectCode, setDefectCode] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) {
      toast.error("A defect title is required.");
      return;
    }
    setIsSaving(true);
    const res = await createDefectAction({ testResultId, vendorId, title, description, severity });
    setIsSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setDefectCode(res.data.defect_code);
    onCreated(res.data.id);
    toast.success(`Logged ${res.data.defect_code}.`);
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-2">
      {defectCode ? <span className="text-sm font-medium">{defectCode}</span> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Bug /> {defectCode ? "Log another defect" : "Log defect"}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log a defect</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
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
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving ? "Saving…" : "Create defect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
