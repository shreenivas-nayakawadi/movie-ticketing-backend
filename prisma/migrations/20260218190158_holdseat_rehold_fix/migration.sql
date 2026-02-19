-- DropIndex
DROP INDEX "HoldSeat_showSeatId_key";

-- CreateIndex
CREATE INDEX "HoldSeat_showSeatId_idx" ON "HoldSeat"("showSeatId");
