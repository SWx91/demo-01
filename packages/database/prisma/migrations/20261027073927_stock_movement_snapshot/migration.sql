/*
  Warnings:

  - Added the required column `productNameSnapshot` to the `StockMovement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sellingPriceMinorSnapshot` to the `StockMovement` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "productNameSnapshot" TEXT NOT NULL,
ADD COLUMN     "sellingPriceMinorSnapshot" INTEGER NOT NULL;
