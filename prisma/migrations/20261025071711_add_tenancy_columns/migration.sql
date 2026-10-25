/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Gym` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `BillingEvent` ADD COLUMN `gymId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Discount` ADD COLUMN `gymId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Gym` ADD COLUMN `billingHour` INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN `brandColor` VARCHAR(191) NOT NULL DEFAULT '#2563eb',
    ADD COLUMN `reminderHour` INTEGER NOT NULL DEFAULT 9,
    ADD COLUMN `slug` VARCHAR(191) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `GymClass` ADD COLUMN `gymId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `GymClassBooking` ADD COLUMN `gymId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `GymClassInstance` ADD COLUMN `gymId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Membership` ADD COLUMN `gymId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `MembershipPlan` ADD COLUMN `gymId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `gymId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `PasswordResetToken` ADD COLUMN `gymId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Payment` ADD COLUMN `gymId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Refund` ADD COLUMN `gymId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `gymId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `GymDomain` (
    `id` VARCHAR(191) NOT NULL,
    `gymId` VARCHAR(191) NOT NULL,
    `hostname` VARCHAR(191) NOT NULL,
    `verifyToken` VARCHAR(191) NOT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GymDomain_hostname_key`(`hostname`),
    INDEX `GymDomain_gymId_idx`(`gymId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `BillingEvent_gymId_idx` ON `BillingEvent`(`gymId`);

-- CreateIndex
CREATE INDEX `Discount_gymId_idx` ON `Discount`(`gymId`);

-- CreateIndex
CREATE UNIQUE INDEX `Gym_slug_key` ON `Gym`(`slug`);

-- CreateIndex
CREATE INDEX `GymClass_gymId_idx` ON `GymClass`(`gymId`);

-- CreateIndex
CREATE INDEX `GymClassBooking_gymId_idx` ON `GymClassBooking`(`gymId`);

-- CreateIndex
CREATE INDEX `GymClassInstance_gymId_idx` ON `GymClassInstance`(`gymId`);

-- CreateIndex
CREATE INDEX `Membership_gymId_idx` ON `Membership`(`gymId`);

-- CreateIndex
CREATE INDEX `MembershipPlan_gymId_idx` ON `MembershipPlan`(`gymId`);

-- CreateIndex
CREATE INDEX `Notification_gymId_idx` ON `Notification`(`gymId`);

-- CreateIndex
CREATE INDEX `PasswordResetToken_gymId_idx` ON `PasswordResetToken`(`gymId`);

-- CreateIndex
CREATE INDEX `Payment_gymId_idx` ON `Payment`(`gymId`);

-- CreateIndex
CREATE INDEX `Refund_gymId_idx` ON `Refund`(`gymId`);

-- CreateIndex
CREATE INDEX `User_gymId_idx` ON `User`(`gymId`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Membership` ADD CONSTRAINT `Membership_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GymDomain` ADD CONSTRAINT `GymDomain_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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
