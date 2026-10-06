-- AlterTable
ALTER TABLE "CallAnalysis" ADD COLUMN "title" TEXT;
ALTER TABLE "CallAnalysis" ADD COLUMN "criteria" JSONB;
ALTER TABLE "CallAnalysis" ADD COLUMN "totalScore" DOUBLE PRECISION;
ALTER TABLE "CallAnalysis" ADD COLUMN "maxScore" DOUBLE PRECISION;
ALTER TABLE "CallAnalysis" ADD COLUMN "percentage" DOUBLE PRECISION;
ALTER TABLE "CallAnalysis" ADD COLUMN "overallComment" TEXT;

-- AlterTable
ALTER TABLE "CallAnalysis" DROP COLUMN IF EXISTS "customerMainProblem";
ALTER TABLE "CallAnalysis" DROP COLUMN IF EXISTS "problemCategory";
ALTER TABLE "CallAnalysis" DROP COLUMN IF EXISTS "customerEmotionalState";
ALTER TABLE "CallAnalysis" DROP COLUMN IF EXISTS "operatorCommunicationQuality";
ALTER TABLE "CallAnalysis" DROP COLUMN IF EXISTS "operatorUnderstoodCustomer";
ALTER TABLE "CallAnalysis" DROP COLUMN IF EXISTS "customerUnderstoodOperator";
ALTER TABLE "CallAnalysis" DROP COLUMN IF EXISTS "problemResolved";
ALTER TABLE "CallAnalysis" DROP COLUMN IF EXISTS "summary";
ALTER TABLE "CallAnalysis" DROP COLUMN IF EXISTS "internalNote";

DROP INDEX IF EXISTS "CallAnalysis_problemCategory_idx";
CREATE INDEX IF NOT EXISTS "CallAnalysis_percentage_idx" ON "CallAnalysis"("percentage");
