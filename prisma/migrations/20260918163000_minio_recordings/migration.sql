-- AlterTable
ALTER TABLE "Call" DROP COLUMN "recordingPath";
ALTER TABLE "Call" ADD COLUMN "recordingBucket" TEXT;
ALTER TABLE "Call" ADD COLUMN "recordingObjectKey" TEXT;
ALTER TABLE "Call" ADD COLUMN "recordingUrl" TEXT;
ALTER TABLE "Call" ADD COLUMN "recordingSizeBytes" INTEGER;
