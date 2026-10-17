/*
  Warnings:

  - A unique constraint covering the columns `[calendarToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `User` ADD COLUMN `calendarToken` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_calendarToken_key` ON `User`(`calendarToken`);
