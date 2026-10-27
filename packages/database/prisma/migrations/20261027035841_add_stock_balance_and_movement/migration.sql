-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('OPENING', 'RECEIPT', 'SALE', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "sourceDocument" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_storeId_productId_key" ON "StockBalance"("storeId", "productId");

-- CreateIndex
CREATE INDEX "StockMovement_storeId_productId_idx" ON "StockMovement"("storeId", "productId");

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- INV-03: the database itself refuses to let a stock balance go negative. This is a hard
-- guarantee at the storage layer, not application logic that could be bypassed.
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_quantity_non_negative" CHECK ("quantity" >= 0);

-- INV-02 / US-13: a stock movement is immutable. Once written it can never be updated or deleted.
-- Enforced in the database with a trigger so no code path — application or ad-hoc — can edit history.
CREATE OR REPLACE FUNCTION "stock_movement_is_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'StockMovement is immutable: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "stock_movement_no_update"
  BEFORE UPDATE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION "stock_movement_is_immutable"();

CREATE TRIGGER "stock_movement_no_delete"
  BEFORE DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION "stock_movement_is_immutable"();
