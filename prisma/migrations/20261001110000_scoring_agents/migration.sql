-- CreateTable
CREATE TABLE "ScoringAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "inboundCriteriaFileName" TEXT NOT NULL,
    "inboundCriteriaText" TEXT NOT NULL,
    "inboundCriteriaObjectKey" TEXT,
    "outboundCriteriaFileName" TEXT NOT NULL,
    "outboundCriteriaText" TEXT NOT NULL,
    "outboundCriteriaObjectKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringAgent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoringAgent_slug_key" ON "ScoringAgent"("slug");

-- CreateIndex
CREATE INDEX "ScoringAgent_isActive_idx" ON "ScoringAgent"("isActive");

-- AlterTable
ALTER TABLE "CallAnalysis" ADD COLUMN "scoringAgentId" TEXT;

-- AddForeignKey
ALTER TABLE "CallAnalysis" ADD CONSTRAINT "CallAnalysis_scoringAgentId_fkey" FOREIGN KEY ("scoringAgentId") REFERENCES "ScoringAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
