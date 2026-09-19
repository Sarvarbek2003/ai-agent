CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "activeAnalysisPromptId" TEXT NOT NULL DEFAULT 'structured',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AppSetting" ("id", "activeAnalysisPromptId", "updatedAt")
VALUES ('app', 'structured', CURRENT_TIMESTAMP);

ALTER TABLE "CallAnalysis" ADD COLUMN "analysisPromptId" TEXT;
