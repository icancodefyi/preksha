-- CreateTable
CREATE TABLE "communication_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "caller" TEXT NOT NULL,
    "receiver" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "call_type" TEXT NOT NULL,
    "caller_cell" TEXT,
    "receiver_cell" TEXT,
    "imei_caller" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "communication_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "communication_events_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "txn_id" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "from_account" TEXT NOT NULL,
    "from_name" TEXT NOT NULL,
    "to_account" TEXT NOT NULL,
    "to_name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT,
    "bank" TEXT,
    "remark" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transactions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transactions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "observations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "dump_id" TEXT NOT NULL,
    "phone" TEXT,
    "imei" TEXT,
    "timestamp" DATETIME NOT NULL,
    "cell_id" TEXT,
    "event" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "observations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "observations_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "communication_events_case_id_caller_receiver_idx" ON "communication_events"("case_id", "caller", "receiver");

-- CreateIndex
CREATE INDEX "communication_events_case_id_timestamp_idx" ON "communication_events"("case_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "communication_events_case_id_call_id_key" ON "communication_events"("case_id", "call_id");

-- CreateIndex
CREATE INDEX "transactions_case_id_from_name_to_name_idx" ON "transactions"("case_id", "from_name", "to_name");

-- CreateIndex
CREATE INDEX "transactions_case_id_timestamp_idx" ON "transactions"("case_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_case_id_txn_id_key" ON "transactions"("case_id", "txn_id");

-- CreateIndex
CREATE INDEX "observations_case_id_phone_idx" ON "observations"("case_id", "phone");

-- CreateIndex
CREATE INDEX "observations_case_id_timestamp_idx" ON "observations"("case_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "observations_case_id_dump_id_key" ON "observations"("case_id", "dump_id");
