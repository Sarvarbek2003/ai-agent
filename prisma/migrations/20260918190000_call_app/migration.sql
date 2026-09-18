-- AlterTable
ALTER TABLE "Call" ADD COLUMN "appId" TEXT;

-- CreateIndex
CREATE INDEX "Call_appId_idx" ON "Call"("appId");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE SET NULL ON UPDATE CASCADE;
