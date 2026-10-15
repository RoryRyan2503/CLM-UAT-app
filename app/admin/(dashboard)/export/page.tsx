import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default function AdminExportPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Export results</h1>
        <p className="text-sm text-foreground-muted">
          Exports are generated on demand from the live database and never read or write the original workbook.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ExportCard
          title="Combined results"
          description="All testers, both vendors, one worksheet."
          href="/api/export/combined"
        />
        <ExportCard title="Ironclad only" description="Ironclad assignments and results." href="/api/export/vendor/ironclad" />
        <ExportCard title="Sirion only" description="Sirion assignments and results." href="/api/export/vendor/sirion" />
      </div>
    </div>
  );
}

function ExportCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <a href={href}>
            <Download /> Download .xlsx
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
