"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownAZ, ArrowUpAZ, Download, FileUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RequiredMark } from "@/components/ui/required-mark";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  bulkCreateTestersAction,
  bulkDeleteTestersAction,
  createTesterAction,
  deleteTesterAction,
  resetAccessCodeAction,
  setTesterActiveAction,
  updateTesterAction,
} from "@/app/actions/admin/testers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Database } from "@/lib/types/database";

type TesterRow = Database["public"]["Tables"]["testers"]["Row"];
type PersonaOption = { id: string; name: string };
type BulkCreatedTester = { name: string; email: string; department: string; persona: string; accessCode: string };
type BulkImportError = { rowNumber: number; message: string };

function csvCell(value: string): string {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, rows: string[][]) {
  const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TestersManager({ testers, personas }: { testers: TesterRow[]; personas: PersonaOption[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TesterRow | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [createPersonaId, setCreatePersonaId] = useState("");
  const [editPersonaId, setEditPersonaId] = useState("");
  const [issuedCode, setIssuedCode] = useState<{ name: string; code: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TesterRow | null>(null);
  const [bulkErrors, setBulkErrors] = useState<BulkImportError[]>([]);
  const [bulkCreated, setBulkCreated] = useState<BulkCreatedTester[]>([]);
  const [search, setSearch] = useState("");
  const [personaFilter, setPersonaFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "email" | "department" | "persona">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedTesterIds, setSelectedTesterIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const res = await createTesterAction(formData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCreateOpen(false);
      setIssuedCode({ name: formData.get("name") as string, code: res.data.accessCode });
      router.refresh();
    });
  }

  function handleBulkCreate(formData: FormData) {
    startTransition(async () => {
      setBulkErrors([]);
      setBulkCreated([]);
      const res = await bulkCreateTestersAction(formData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data.errors.length > 0) {
        setBulkErrors(res.data.errors);
        return;
      }
      setBulkCreated(res.data.created);
      toast.success(`Created ${res.data.created.length} testers. Save their access codes now.`);
      router.refresh();
    });
  }

  function downloadRosterTemplate() {
    downloadCsv("tester-roster-template.csv", [
      ["Name", "Email", "Department", "Persona"],
      ["Example Tester", "example@example.com", "Legal", personas[0]?.name ?? ""],
    ]);
  }

  function downloadBulkCodes() {
    downloadCsv("tester-access-codes.csv", [
      ["Name", "Email", "Department", "Persona", "Access Code"],
      ...bulkCreated.map((tester) => [tester.name, tester.email, tester.department, tester.persona, tester.accessCode]),
    ]);
  }

  function openEdit(tester: TesterRow) {
    setEditTarget(tester);
    setEditPersonaId(tester.persona_id ?? personas.find((persona) => persona.name === tester.persona)?.id ?? "");
  }

  function handleEdit(formData: FormData) {
    if (!editTarget) return;
    startTransition(async () => {
      const res = await updateTesterAction(editTarget.id, formData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tester updated.");
      setEditTarget(null);
      router.refresh();
    });
  }

  function handleReset(testerId: string, name: string) {
    startTransition(async () => {
      const res = await resetAccessCodeAction(testerId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setIssuedCode({ name, code: res.data.accessCode });
    });
  }

  function handleToggleActive(testerId: string, isActive: boolean) {
    startTransition(async () => {
      const res = await setTesterActiveAction(testerId, !isActive);
      if (!res.ok) toast.error(res.error);
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await deleteTesterAction(deleteTarget.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${deleteTarget.name} was deleted.`);
      setDeleteTarget(null);
      router.refresh();
    });
  }

  function handleBulkDelete() {
    startTransition(async () => {
      const res = await bulkDeleteTestersAction(selectedTesterIds);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Deleted ${selectedTesterIds.length} tester${selectedTesterIds.length === 1 ? "" : "s"}.`);
      setSelectedTesterIds([]);
      setBulkDeleteOpen(false);
      router.refresh();
    });
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filteredTesters = testers
    .filter((tester) => {
      const matchesSearch = !normalizedSearch || [tester.name, tester.email, tester.department, tester.persona]
        .some((value) => value?.toLowerCase().includes(normalizedSearch));
      const filterPersona = personas.find((persona) => persona.id === personaFilter);
      const matchesPersona = personaFilter === "all" || tester.persona_id === personaFilter ||
        (!tester.persona_id && tester.persona?.trim().toLowerCase() === filterPersona?.name.trim().toLowerCase());
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "active" ? tester.is_active : !tester.is_active);
      return matchesSearch && matchesPersona && matchesStatus;
    })
    .sort((left, right) => {
      const leftValue = (left[sortBy] ?? "").toLowerCase();
      const rightValue = (right[sortBy] ?? "").toLowerCase();
      const comparison = leftValue.localeCompare(rightValue) || left.id.localeCompare(right.id);
      return sortDirection === "asc" ? comparison : -comparison;
    });
  const visibleSelectedCount = filteredTesters.filter((tester) => selectedTesterIds.includes(tester.id)).length;
  const allVisibleSelected = filteredTesters.length > 0 && visibleSelectedCount === filteredTesters.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  function toggleTester(testerId: string, checked: boolean) {
    setSelectedTesterIds((previous) => checked
      ? previous.includes(testerId) ? previous : [...previous, testerId]
      : previous.filter((id) => id !== testerId));
  }

  function toggleVisibleTesters(checked: boolean) {
    const visibleIds = new Set(filteredTesters.map((tester) => tester.id));
    setSelectedTesterIds((previous) => checked
      ? [...new Set([...previous, ...visibleIds])]
      : previous.filter((id) => !visibleIds.has(id)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Dialog open={bulkOpen} onOpenChange={(open) => {
          setBulkOpen(open);
          if (!open) {
            setBulkErrors([]);
            setBulkCreated([]);
          }
        }}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" disabled={!personas.length}>
              <FileUp /> Import testers
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Import testers</DialogTitle>
              <DialogDescription>
                Upload a CSV or Excel roster with Name and Persona columns. Email and Department are optional.
                Persona values must match a configured persona. Up to 100 testers can be imported at once.
              </DialogDescription>
            </DialogHeader>

            {bulkCreated.length === 0 ? (
              <form action={handleBulkCreate} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="tester-roster-file" className="text-sm text-foreground-muted">Roster file<RequiredMark /> (columns: Name, Persona)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={downloadRosterTemplate}>
                    <Download /> Download CSV template
                  </Button>
                </div>
                <Input id="tester-roster-file" name="file" type="file" accept=".csv,.xlsx,.xls" required disabled={isPending} />
                <p className="text-xs text-foreground-muted">Maximum file size: 2 MB. Access codes are generated after validation and shown once.</p>
                {bulkErrors.length > 0 ? (
                  <div className="max-h-56 overflow-auto rounded-md border border-critical p-3" role="alert">
                    <p className="mb-2 text-sm font-semibold">No testers were created. Correct these rows and upload again:</p>
                    <ul className="flex flex-col gap-1 text-sm">
                      {bulkErrors.map((error, index) => (
                        <li key={`${error.rowNumber}-${index}`}>Row {error.rowNumber}: {error.message}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <DialogFooter>
                  <Button type="submit" disabled={isPending || !personas.length}>
                    <FileUp /> {isPending ? "Importing…" : "Validate and import"}
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Created {bulkCreated.length} testers. Save these codes now; they cannot be shown again.</p>
                  <Button type="button" onClick={downloadBulkCodes}>
                    <Download /> Download access codes
                  </Button>
                </div>
                <div className="max-h-96 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Persona</TableHead>
                        <TableHead>Access code</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bulkCreated.map((tester, index) => (
                        <TableRow key={`${tester.email}-${index}`}>
                          <TableCell>{tester.name}</TableCell>
                          <TableCell>{tester.email || "—"}</TableCell>
                          <TableCell>{tester.persona}</TableCell>
                          <TableCell><code className="font-mono">{tester.accessCode}</code></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>Done</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>Add tester</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add tester</DialogTitle>
            </DialogHeader>
            <form action={handleCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Name<RequiredMark /></Label>
                <Input id="name" name="name" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email (optional)</Label>
                <Input id="email" name="email" type="email" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="department">Department (optional)</Label>
                <Input id="department" name="department" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Persona<RequiredMark /></Label>
                {personas.length ? (
                  <Select value={createPersonaId} onValueChange={setCreatePersonaId} required>
                    <SelectTrigger><SelectValue placeholder="Select a configured persona" /></SelectTrigger>
                    <SelectContent>{personas.map((persona) => <SelectItem key={persona.id} value={persona.id}>{persona.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <p className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-sm text-warning">Create a persona in Admin → Assignments before adding a tester.</p>
                )}
                <input type="hidden" name="personaId" value={createPersonaId} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isPending || !personas.length || !createPersonaId}>
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {issuedCode ? (
        <div className="rounded-md border border-primary bg-surface p-4 text-sm">
          Access code for <strong>{issuedCode.name}</strong>: <code className="font-mono text-base">{issuedCode.code}</code>
          <p className="mt-1 text-foreground-muted">
            This code will not be shown again. Share it securely with the tester now.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="tester-search">Search testers</Label>
          <Input id="tester-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, department…" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tester-persona-filter">Persona</Label>
          <select id="tester-persona-filter" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={personaFilter} onChange={(event) => setPersonaFilter(event.target.value)}>
            <option value="all">All personas</option>
            {personas.map((persona) => <option key={persona.id} value={persona.id}>{persona.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tester-status-filter">Status</Label>
          <select id="tester-status-filter" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tester-sort">Sort by</Label>
          <select id="tester-sort" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
            <option value="name">Name</option>
            <option value="email">Email</option>
            <option value="department">Department</option>
            <option value="persona">Persona</option>
          </select>
        </div>
        <Button type="button" size="icon" variant="outline" onClick={() => setSortDirection((direction) => direction === "asc" ? "desc" : "asc")} aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`} title={`Currently ${sortDirection === "asc" ? "ascending" : "descending"}`}>
          {sortDirection === "asc" ? <ArrowDownAZ /> : <ArrowUpAZ />}
        </Button>
        <div className="flex h-10 items-center gap-2 px-1 text-sm">
          <Checkbox aria-label="Select all visible testers" checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false} onCheckedChange={(checked) => toggleVisibleTesters(checked === true)} />
          <span>Select all visible ({filteredTesters.length})</span>
        </div>
        <Button type="button" variant="destructive" disabled={isPending || selectedTesterIds.length === 0} onClick={() => setBulkDeleteOpen(true)}>
          <Trash2 /> Delete selected ({selectedTesterIds.length})
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox aria-label="Select all visible testers" checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false} onCheckedChange={(checked) => toggleVisibleTesters(checked === true)} />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Persona</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTesters.map((t) => (
              <TableRow key={t.id}>
                <TableCell><Checkbox aria-label={`Select ${t.name}`} checked={selectedTesterIds.includes(t.id)} onCheckedChange={(checked) => toggleTester(t.id, checked === true)} /></TableCell>
                <TableCell className="font-medium">{t.name}{t.email ? <div className="text-xs font-normal text-foreground-muted">{t.email}</div> : null}</TableCell>
                <TableCell>{t.department ?? "—"}</TableCell>
                <TableCell>{t.persona ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={t.is_active ? "success" : "outline"}>{t.is_active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell><div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" disabled={isPending || personas.length === 0} onClick={() => openEdit(t)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleReset(t.id, t.name)}>
                    Reset code
                  </Button>
                  <Button
                    size="sm"
                    variant={t.is_active ? "destructive" : "secondary"}
                    disabled={isPending}
                    onClick={() => handleToggleActive(t.id, t.is_active)}
                  >
                    {t.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button size="icon" variant="destructive" disabled={isPending} onClick={() => setDeleteTarget(t)} aria-label={`Delete ${t.name}`} title="Delete tester and all associated test data">
                    <Trash2 />
                  </Button>
                </div></TableCell>
              </TableRow>
            ))}
            {filteredTesters.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-foreground-muted">No testers match these filters.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editTarget !== null} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit tester</DialogTitle>
            <DialogDescription>Choose a configured persona. Existing assignments and evaluation history are preserved.</DialogDescription>
          </DialogHeader>
          {editTarget ? (
            <form action={handleEdit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5"><Label htmlFor="edit-name">Name<RequiredMark /></Label><Input id="edit-name" name="name" required defaultValue={editTarget.name} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="edit-email">Email</Label><Input id="edit-email" name="email" type="email" defaultValue={editTarget.email ?? ""} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="edit-department">Department</Label><Input id="edit-department" name="department" defaultValue={editTarget.department ?? ""} /></div>
              <div className="flex flex-col gap-1.5">
                <Label>Persona<RequiredMark /></Label>
                <Select value={editPersonaId} onValueChange={setEditPersonaId} required>
                  <SelectTrigger><SelectValue placeholder="Select a configured persona" /></SelectTrigger>
                  <SelectContent>{personas.map((persona) => <SelectItem key={persona.id} value={persona.id}>{persona.name}</SelectItem>)}</SelectContent>
                </Select>
                <input type="hidden" name="personaId" value={editPersonaId} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
                <Button type="submit" disabled={isPending || !editPersonaId}>{isPending ? "Saving…" : "Save tester"}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected testers?</DialogTitle>
            <DialogDescription>
              Delete {selectedTesterIds.length} selected tester{selectedTesterIds.length === 1 ? "" : "s"} only if they have no evaluation data or history. If any selected tester has been used, the entire deletion is blocked and no evaluation history is removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={isPending}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={handleBulkDelete} disabled={isPending}>
              {isPending ? "Checking and deleting…" : "Delete selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete tester and testing data?</DialogTitle>
            <DialogDescription>
              Delete {deleteTarget?.name ?? "this tester"} only if they have no evaluation data or history. If they have been used, deletion is blocked; deactivate them instead to preserve history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={isPending}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? "Checking and deleting…" : "Delete tester"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
