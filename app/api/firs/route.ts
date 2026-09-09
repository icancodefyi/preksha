import { firs } from "@/lib/data/seed";

export async function GET() {
  return Response.json(
    firs.map((f) => ({
      idx: f.idx,
      fir_no: f.fir_no,
      year: f.year,
      police_station: f.police_station,
      incident_date: f.incident_date,
      title: f.title,
      category: f.category,
      sections: f.sections,
      related_firs: f.related_firs,
      accused: f.accused,
    })),
  );
}