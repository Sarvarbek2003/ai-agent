ALTER TABLE "ScoringAgent" ADD COLUMN "openaiInboundVectorStoreId" TEXT;
ALTER TABLE "ScoringAgent" ADD COLUMN "openaiOutboundVectorStoreId" TEXT;
ALTER TABLE "ScoringAgent" ADD COLUMN "openaiInboundFileId" TEXT;
ALTER TABLE "ScoringAgent" ADD COLUMN "openaiOutboundFileId" TEXT;

ALTER TABLE "ScoringAgent" DROP COLUMN IF EXISTS "openaiInboundAgentId";
ALTER TABLE "ScoringAgent" DROP COLUMN IF EXISTS "openaiOutboundAgentId";
