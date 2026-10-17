"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileText, Link as LinkIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  uploadEvidenceFileAction,
  registerEvidenceUrlAction,
  getSignedEvidenceUrlAction,
} from "@/app/actions/evidence";
import type { Database } from "@/lib/types/database";

type EvidenceRow = Database["public"]["Tables"]["evidence"]["Row"];

export function EvidenceManager({
  testResultId,
  evidence,
  onAdded,
}: {
  testResultId: string;
  evidence: EvidenceRow[];
  onAdded: (evidence: EvidenceRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(file: File | undefined) {
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const uploadRes = await uploadEvidenceFileAction(testResultId, formData);
      if (!uploadRes.ok) throw new Error(uploadRes.error);

      onAdded(uploadRes.data);
      toast.success("Evidence uploaded.");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleAddUrl() {
    if (!url.trim()) return;
    const res = await registerEvidenceUrlAction(testResultId, url.trim());
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onAdded(res.data);
    setUrl("");
    setOpen(false);
    toast.success("Evidence link added.");
  }

  async function handleView(evidenceId: string) {
    const res = await getSignedEvidenceUrlAction(evidenceId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    window.open(res.data, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {evidence.map((e) => (
          <Button
            key={e.id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => (e.kind === "url" && e.url ? window.open(e.url, "_blank", "noopener,noreferrer") : handleView(e.id))}
          >
            {e.kind === "url" ? <LinkIcon /> : <FileText />}
            {e.file_name ?? e.url}
          </Button>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="w-fit">
            <Plus /> Add evidence
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add evidence</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Upload a file</label>
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xls,.xlsx,.doc,.docx"
                disabled={isUploading}
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm font-medium">Or link to evidence</label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </div>
              <Button type="button" onClick={handleAddUrl}>
                Add link
              </Button>
            </div>
          </div>
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </div>
  );
}
