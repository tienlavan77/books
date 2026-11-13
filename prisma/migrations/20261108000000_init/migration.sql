/*
 * Mục đích nghiệp vụ: Thiết lập cấu trúc bảng cơ sở dữ liệu MariaDB ban đầu cho ứng dụng đọc sách PDF cá nhân.
 * Mô tả kỹ thuật: Tạo bảng owner_accounts để lưu thông tin tài khoản chủ sở hữu SINGLE_OWNER, bảng books lưu metadata sách PDF cùng khóa lưu trữ riêng tư trên máy chủ, và bảng reading_progress lưu tiến độ đọc đồng bộ đa thiết bị với khóa ngoại tự động xóa theo sách.
 */
-- CreateTable
CREATE TABLE `owner_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(120) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `displayName` VARCHAR(120) NOT NULL DEFAULT 'Chủ sở hữu',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `owner_accounts_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `books` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `originalName` VARCHAR(255) NOT NULL,
    `storageKey` VARCHAR(255) NOT NULL,
    `thumbnailKey` VARCHAR(255) NULL,
    `fileSize` INTEGER NOT NULL,
    `pageCount` INTEGER NOT NULL DEFAULT 1,
    `mimeType` VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `books_storageKey_key`(`storageKey`),
    INDEX `books_title_idx`(`title`),
    INDEX `books_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reading_progress` (
    `id` VARCHAR(191) NOT NULL,
    `bookId` VARCHAR(191) NOT NULL,
    `currentPage` INTEGER NOT NULL DEFAULT 1,
    `progressPercent` DOUBLE NOT NULL DEFAULT 0,
    `lastDevice` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `reading_progress_bookId_key`(`bookId`),
    INDEX `reading_progress_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reading_progress` ADD CONSTRAINT `reading_progress_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
