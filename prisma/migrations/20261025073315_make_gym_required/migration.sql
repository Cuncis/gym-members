/*
  Warnings:

  - You are about to drop the `GymSettings` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[gymId,code]` on the table `Discount` will be added. If there are existing duplicate values, this will fail.
  - Made the column `gymId` on table `BillingEvent` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gymId` on table `Discount` required. This step will fail if there are existing NULL values in that column.
  - Made the column `slug` on table `Gym` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gymId` on table `GymClass` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gymId` on table `GymClassBooking` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gymId` on table `GymClassInstance` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gymId` on table `Membership` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gymId` on table `MembershipPlan` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gymId` on table `Notification` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gymId` on table `PasswordResetToken` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gymId` on table `Payment` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gymId` on table `Refund` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gymId` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `BillingEvent` DROP FOREIGN KEY `BillingEvent_gymId_fkey`;

-- DropForeignKey
ALTER TABLE `Discount` DROP FOREIGN KEY `Discount_gymId_fkey`;

-- DropForeignKey
ALTER TABLE `GymClass` DROP FOREIGN KEY `GymClass_gymId_fkey`;

-- DropForeignKey
ALTER TABLE `GymClassBooking` DROP FOREIGN KEY `GymClassBooking_gymId_fkey`;

-- DropForeignKey
ALTER TABLE `GymClassInstance` DROP FOREIGN KEY `GymClassInstance_gymId_fkey`;

-- DropForeignKey
ALTER TABLE `Membership` DROP FOREIGN KEY `Membership_gymId_fkey`;

-- DropForeignKey
ALTER TABLE `MembershipPlan` DROP FOREIGN KEY `MembershipPlan_gymId_fkey`;

-- DropForeignKey
ALTER TABLE `Notification` DROP FOREIGN KEY `Notification_gymId_fkey`;

-- DropForeignKey
ALTER TABLE `PasswordResetToken` DROP FOREIGN KEY `PasswordResetToken_gymId_fkey`;

-- DropForeignKey
ALTER TABLE `Payment` DROP FOREIGN KEY `Payment_gymId_fkey`;

-- DropForeignKey
ALTER TABLE `Refund` DROP FOREIGN KEY `Refund_gymId_fkey`;

-- DropForeignKey
ALTER TABLE `User` DROP FOREIGN KEY `User_gymId_fkey`;

-- DropIndex
DROP INDEX `Discount_code_key` ON `Discount`;

-- DropIndex
DROP INDEX `Discount_gymId_idx` ON `Discount`;

-- AlterTable
ALTER TABLE `BillingEvent` MODIFY `gymId` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `Discount` MODIFY `gymId` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `Gym` MODIFY `slug` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `GymClass` MODIFY `gymId` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `GymClassBooking` MODIFY `gymId` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `GymClassInstance` MODIFY `gymId` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `Membership` MODIFY `gymId` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `MembershipPlan` MODIFY `gymId` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `Notification` MODIFY `gymId` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `PasswordResetToken` MODIFY `gymId` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `Payment` MODIFY `gymId` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `Refund` MODIFY `gymId` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `User` MODIFY `gymId` VARCHAR(191) NOT NULL DEFAULT '';

-- DropTable
DROP TABLE `GymSettings`;

-- CreateIndex
CREATE UNIQUE INDEX `Discount_gymId_code_key` ON `Discount`(`gymId`, `code`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Membership` ADD CONSTRAINT `Membership_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GymClass` ADD CONSTRAINT `GymClass_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GymClassInstance` ADD CONSTRAINT `GymClassInstance_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GymClassBooking` ADD CONSTRAINT `GymClassBooking_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MembershipPlan` ADD CONSTRAINT `MembershipPlan_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Discount` ADD CONSTRAINT `Discount_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BillingEvent` ADD CONSTRAINT `BillingEvent_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Refund` ADD CONSTRAINT `Refund_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
