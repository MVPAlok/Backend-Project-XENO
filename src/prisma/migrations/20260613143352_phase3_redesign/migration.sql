-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ImportStatus" ADD VALUE 'PREVIEW_READY';
ALTER TYPE "ImportStatus" ADD VALUE 'CONFIRMED';

-- AlterTable
ALTER TABLE "import_jobs" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedBy" UUID,
ADD COLUMN     "conflictSummary" JSONB,
ADD COLUMN     "detectedMappings" JSONB,
ADD COLUMN     "previewData" JSONB,
ADD COLUMN     "resolutionStrategy" TEXT,
ALTER COLUMN "type" SET DEFAULT 'SALES_EXPORT';

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
