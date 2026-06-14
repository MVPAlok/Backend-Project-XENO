-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'CONVERTED', 'FAILED');

-- CreateTable
CREATE TABLE "campaign_deliveries" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'SENT',
    "messageSubject" TEXT,
    "messageBody" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_deliveries_workspaceId_idx" ON "campaign_deliveries"("workspaceId");

-- CreateIndex
CREATE INDEX "campaign_deliveries_campaignId_idx" ON "campaign_deliveries"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_deliveries_customerId_idx" ON "campaign_deliveries"("customerId");

-- CreateIndex
CREATE INDEX "campaign_deliveries_status_idx" ON "campaign_deliveries"("status");

-- AddForeignKey
ALTER TABLE "campaign_deliveries" ADD CONSTRAINT "campaign_deliveries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_deliveries" ADD CONSTRAINT "campaign_deliveries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_deliveries" ADD CONSTRAINT "campaign_deliveries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
