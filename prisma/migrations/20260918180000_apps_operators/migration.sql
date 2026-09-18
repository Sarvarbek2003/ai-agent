-- CreateTable
CREATE TABLE "App" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Call" ADD COLUMN "operatorId" TEXT;

-- AlterTable
ALTER TABLE "CallAnalysis" ADD COLUMN "operatorName" TEXT;
ALTER TABLE "CallAnalysis" ADD COLUMN "operatorCode" TEXT;
ALTER TABLE "CallAnalysis" ADD COLUMN "appName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "App_name_key" ON "App"("name");
CREATE UNIQUE INDEX "App_slug_key" ON "App"("slug");
CREATE UNIQUE INDEX "Operator_code_key" ON "Operator"("code");
CREATE INDEX "Operator_appId_idx" ON "Operator"("appId");
CREATE INDEX "Operator_name_idx" ON "Operator"("name");
CREATE INDEX "Call_operatorId_idx" ON "Call"("operatorId");
CREATE INDEX "CallAnalysis_operatorCode_idx" ON "CallAnalysis"("operatorCode");
CREATE INDEX "CallAnalysis_appName_idx" ON "CallAnalysis"("appName");

-- AddForeignKey
ALTER TABLE "Operator" ADD CONSTRAINT "Operator_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Call" ADD CONSTRAINT "Call_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
