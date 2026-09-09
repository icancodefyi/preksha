-- CreateTable
CREATE TABLE "firs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "fir_no" TEXT,
    "narrative" TEXT NOT NULL,
    "extracted_entities" JSONB NOT NULL,
    "extractor_version" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "firs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "firs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "firs_case_id_idx" ON "firs"("case_id");
