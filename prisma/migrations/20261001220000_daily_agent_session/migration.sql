-- AlterTable
ALTER TABLE "DailyThread" ADD COLUMN "openaiAgentSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DailyThread_openaiAgentSessionId_key" ON "DailyThread"("openaiAgentSessionId");
