-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('inbound', 'outbound', 'unknown');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('ringing', 'in_progress', 'answered', 'no_answer', 'completed', 'awaiting_recording', 'transcribing', 'analyzing', 'analyzed', 'skipped', 'failed');

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'newtel',
    "eventName" TEXT NOT NULL,
    "signature" TEXT,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "vpbxId" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "callId" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "vpbxId" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL DEFAULT 'unknown',
    "status" "CallStatus" NOT NULL DEFAULT 'ringing',
    "customerNumber" TEXT,
    "operatorNumber" TEXT,
    "dnid" TEXT,
    "clid" TEXT,
    "firstAnswer" TEXT,
    "allAnswer" JSONB,
    "durationSec" INTEGER,
    "ringDurationSec" INTEGER,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "callRecordLink" TEXT,
    "recordingPath" TEXT,
    "recordingMimeType" TEXT,
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "durationSec" DOUBLE PRECISION,
    "fullText" TEXT NOT NULL,
    "segments" JSONB NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyThread" (
    "id" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "openaiConversationId" TEXT NOT NULL,
    "lastResponseId" TEXT,
    "reportJson" JSONB,
    "reportText" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallAnalysis" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "dailyThreadId" TEXT,
    "model" TEXT NOT NULL,
    "customerMainProblem" TEXT,
    "problemCategory" TEXT,
    "customerEmotionalState" TEXT,
    "operatorCommunicationQuality" TEXT,
    "operatorUnderstoodCustomer" TEXT,
    "customerUnderstoodOperator" TEXT,
    "problemResolved" TEXT,
    "summary" TEXT,
    "internalNote" TEXT,
    "score" INTEGER,
    "rawJson" JSONB NOT NULL,
    "openaiResponseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookEvent_vpbxId_idx" ON "WebhookEvent"("vpbxId");

-- CreateIndex
CREATE INDEX "WebhookEvent_eventName_idx" ON "WebhookEvent"("eventName");

-- CreateIndex
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Call_vpbxId_key" ON "Call"("vpbxId");

-- CreateIndex
CREATE INDEX "Call_status_idx" ON "Call"("status");

-- CreateIndex
CREATE INDEX "Call_createdAt_idx" ON "Call"("createdAt");

-- CreateIndex
CREATE INDEX "Call_operatorNumber_idx" ON "Call"("operatorNumber");

-- CreateIndex
CREATE INDEX "Call_customerNumber_idx" ON "Call"("customerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_callId_key" ON "Transcript"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyThread_localDate_key" ON "DailyThread"("localDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyThread_openaiConversationId_key" ON "DailyThread"("openaiConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "CallAnalysis_callId_key" ON "CallAnalysis"("callId");

-- CreateIndex
CREATE INDEX "CallAnalysis_problemCategory_idx" ON "CallAnalysis"("problemCategory");

-- CreateIndex
CREATE INDEX "CallAnalysis_score_idx" ON "CallAnalysis"("score");

-- CreateIndex
CREATE INDEX "CallAnalysis_createdAt_idx" ON "CallAnalysis"("createdAt");

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAnalysis" ADD CONSTRAINT "CallAnalysis_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAnalysis" ADD CONSTRAINT "CallAnalysis_dailyThreadId_fkey" FOREIGN KEY ("dailyThreadId") REFERENCES "DailyThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

