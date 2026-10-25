-- AlterTable
ALTER TABLE `User` ADD COLUMN `smsConsentAt` DATETIME(3) NULL,
    ADD COLUMN `smsOptIn` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `GymSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'gym',
    `name` VARCHAR(191) NOT NULL DEFAULT 'My Gym',
    `timeZone` VARCHAR(191) NOT NULL DEFAULT 'America/New_York',
    `billingHour` INTEGER NOT NULL DEFAULT 3,
    `reminderHour` INTEGER NOT NULL DEFAULT 9,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `channel` ENUM('EMAIL', 'SMS') NOT NULL,
    `template` VARCHAR(191) NOT NULL,
    `dedupeKey` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `providerMessageId` VARCHAR(191) NULL,
    `error` VARCHAR(500) NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Notification_dedupeKey_key`(`dedupeKey`),
    INDEX `Notification_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    INDEX `Notification_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
