-- CreateEnum
CREATE TYPE "SecurityRisk" AS ENUM ('High', 'Medium', 'Low');

-- AlterTable
ALTER TABLE "repositories" ADD COLUMN "securityRisk" "SecurityRisk",
ADD COLUMN "securitySummary" TEXT,
ADD COLUMN "securityAnalyzedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "repositories_securityRisk_idx" ON "repositories"("securityRisk");
