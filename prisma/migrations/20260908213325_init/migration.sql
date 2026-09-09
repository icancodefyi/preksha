-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "roles" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" INTEGER NOT NULL,

    PRIMARY KEY ("user_id", "role_id"),
    CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "sensitivity" TEXT NOT NULL DEFAULT 'standard',
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "case_assignments" (
    "case_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_level" TEXT NOT NULL,
    "granted_by" TEXT,
    "granted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("case_id", "user_id"),
    CONSTRAINT "case_assignments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "case_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "case_assignments_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "object_storage_key" TEXT NOT NULL,
    "uploaded_by" TEXT,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "files_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ingestion_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "file_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" DATETIME,
    "finished_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ingestion_jobs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ingestion_jobs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "file_id" TEXT,
    "stage" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" TEXT,
    "extractor" TEXT,
    "extractor_version" TEXT,
    "confidence" REAL,
    "span_start" INTEGER,
    "span_end" INTEGER,
    "page" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evidence_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "evidence_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "entity_resolution_candidates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "entity_a_ref" TEXT NOT NULL,
    "entity_b_ref" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "signals" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_by" TEXT,
    "decided_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entity_resolution_candidates_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "entity_resolution_candidates_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "analytical_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "parameters" JSONB,
    "result_summary" JSONB,
    "computed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggered_by" TEXT,
    CONSTRAINT "analytical_runs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "analytical_runs_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject_ref" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "model" TEXT NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inferences_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "case_id" TEXT,
    "resource_ref" TEXT,
    "request_summary" JSONB,
    "result_summary" JSONB,
    "ip_address" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "generated_by" TEXT,
    "cited_evidence_ids" JSONB NOT NULL,
    "object_storage_key" TEXT NOT NULL,
    "generated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "reports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "files_case_id_content_hash_key" ON "files"("case_id", "content_hash");

-- CreateIndex
CREATE INDEX "ingestion_jobs_case_id_status_idx" ON "ingestion_jobs"("case_id", "status");

-- CreateIndex
CREATE INDEX "evidence_case_id_record_type_idx" ON "evidence"("case_id", "record_type");

-- CreateIndex
CREATE INDEX "entity_resolution_candidates_case_id_status_idx" ON "entity_resolution_candidates"("case_id", "status");

-- CreateIndex
CREATE INDEX "analytical_runs_case_id_metric_computed_at_idx" ON "analytical_runs"("case_id", "metric", "computed_at");

-- CreateIndex
CREATE INDEX "audit_logs_case_id_at_idx" ON "audit_logs"("case_id", "at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_at_idx" ON "audit_logs"("actor_id", "at");
