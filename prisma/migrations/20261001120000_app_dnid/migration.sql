-- CreateTable
CREATE TABLE "AppDnid" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppDnid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppDnid_phone_key" ON "AppDnid"("phone");

-- CreateIndex
CREATE INDEX "AppDnid_appId_idx" ON "AppDnid"("appId");

-- AddForeignKey
ALTER TABLE "AppDnid" ADD CONSTRAINT "AppDnid_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
