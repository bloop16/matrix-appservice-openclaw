-- CreateIndex
CREATE INDEX "Message_roomId_timestamp_idx" ON "Message"("roomId", "timestamp");

-- CreateIndex
CREATE INDEX "Room_agentId_idx" ON "Room"("agentId");

-- CreateIndex
CREATE INDEX "Room_matrixUserId_idx" ON "Room"("matrixUserId");
