-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "city" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "category" TEXT,
ADD COLUMN     "discountUsage" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "segments" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment_rules" (
    "id" UUID NOT NULL,
    "segmentId" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "segment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "segments_workspaceId_idx" ON "segments"("workspaceId");

-- CreateIndex
CREATE INDEX "segments_createdBy_idx" ON "segments"("createdBy");

-- CreateIndex
CREATE INDEX "segment_rules_segmentId_idx" ON "segment_rules"("segmentId");

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_rules" ADD CONSTRAINT "segment_rules_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
