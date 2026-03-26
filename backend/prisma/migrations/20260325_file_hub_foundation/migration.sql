-- AlterTable
ALTER TABLE `ia_executions` ADD COLUMN `file_job_id` VARCHAR(36) NULL;

-- AlterTable
ALTER TABLE `import_batches` ADD COLUMN `file_id` VARCHAR(36) NULL;

-- AlterTable
ALTER TABLE `import_items` ADD COLUMN `file_job_id` VARCHAR(36) NULL;

-- CreateTable
CREATE TABLE `files` (
    `id` VARCHAR(36) NOT NULL,
    `company_id` INTEGER NULL,
    `sha256` CHAR(64) NOT NULL,
    `size_bytes` BIGINT NULL,
    `mime_type` VARCHAR(120) NULL,
    `original_name` VARCHAR(500) NULL,
    `extension` VARCHAR(20) NULL,
    `storage_backend` VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
    `storage_key` VARCHAR(500) NOT NULL,
    `storage_bucket` VARCHAR(100) NULL,
    `uploaded_by` INTEGER NULL,
    `is_encrypted` BOOLEAN NOT NULL DEFAULT false,
    `retention_class` VARCHAR(30) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `uq_files_sha256`(`sha256`),
    INDEX `fk_files_uploader`(`uploaded_by`),
    INDEX `idx_files_company_date`(`company_id`, `created_at`),
    INDEX `idx_files_mime`(`mime_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_intakes` (
    `id` VARCHAR(36) NOT NULL,
    `file_id` VARCHAR(36) NOT NULL,
    `source` VARCHAR(30) NOT NULL DEFAULT 'UPLOAD_UI',
    `source_ref` VARCHAR(100) NULL,
    `intake_status` VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
    `dedup_hit` BOOLEAN NOT NULL DEFAULT false,
    `received_by` INTEGER NULL,
    `received_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `queued_at` DATETIME(0) NULL,
    `started_at` DATETIME(0) NULL,
    `finished_at` DATETIME(0) NULL,
    `error_message` TEXT NULL,

    INDEX `fk_file_intake_receiver`(`received_by`),
    INDEX `idx_file_intake_file`(`file_id`),
    INDEX `idx_file_intake_status`(`intake_status`),
    INDEX `idx_file_intake_received`(`received_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_jobs` (
    `id` VARCHAR(36) NOT NULL,
    `file_id` VARCHAR(36) NOT NULL,
    `intake_id` VARCHAR(36) NULL,
    `job_type` VARCHAR(50) NOT NULL,
    `processor` VARCHAR(50) NOT NULL,
    `processor_version` VARCHAR(30) NOT NULL DEFAULT 'v1',
    `job_status` VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    `priority` INTEGER NOT NULL DEFAULT 5,
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `progress_current` INTEGER NOT NULL DEFAULT 0,
    `progress_total` INTEGER NOT NULL DEFAULT 0,
    `idempotency_key` VARCHAR(191) NULL,
    `started_at` DATETIME(0) NULL,
    `finished_at` DATETIME(0) NULL,
    `error_message` TEXT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_file_jobs_idempotency_key`(`idempotency_key`),
    INDEX `fk_file_jobs_intake`(`intake_id`),
    INDEX `idx_file_jobs_file_date`(`file_id`, `created_at`),
    INDEX `idx_file_jobs_status`(`job_status`),
    UNIQUE INDEX `uq_file_jobs_file_processor`(`file_id`, `job_type`, `processor`, `processor_version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_artifacts` (
    `id` VARCHAR(36) NOT NULL,
    `file_job_id` VARCHAR(36) NOT NULL,
    `artifact_type` VARCHAR(40) NOT NULL,
    `artifact_version` INTEGER NOT NULL DEFAULT 1,
    `content_json` JSON NULL,
    `content_text` LONGTEXT NULL,
    `content_hash` CHAR(64) NULL,
    `is_valid` BOOLEAN NULL,
    `quality_score` DECIMAL(5, 2) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_file_artifacts_type`(`artifact_type`),
    UNIQUE INDEX `uq_file_artifacts_job_type_version`(`file_job_id`, `artifact_type`, `artifact_version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_events` (
    `id` VARCHAR(36) NOT NULL,
    `file_id` VARCHAR(36) NOT NULL,
    `intake_id` VARCHAR(36) NULL,
    `file_job_id` VARCHAR(36) NULL,
    `event_type` VARCHAR(50) NOT NULL,
    `event_payload` JSON NULL,
    `actor_contact_id` INTEGER NULL,
    `event_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_file_events_intake`(`intake_id`),
    INDEX `fk_file_events_job`(`file_job_id`),
    INDEX `fk_file_events_actor`(`actor_contact_id`),
    INDEX `idx_file_events_file_date`(`file_id`, `event_at`),
    INDEX `idx_file_events_type`(`event_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `fk_ia_exec_file_job` ON `ia_executions`(`file_job_id`);

-- CreateIndex
CREATE INDEX `fk_import_batch_file` ON `import_batches`(`file_id`);

-- CreateIndex
CREATE INDEX `fk_import_item_file_job` ON `import_items`(`file_job_id`);

-- AddForeignKey
ALTER TABLE `import_batches` ADD CONSTRAINT `fk_import_batch_file` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `import_items` ADD CONSTRAINT `fk_import_item_file_job` FOREIGN KEY (`file_job_id`) REFERENCES `file_jobs`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ia_task_configs` ADD CONSTRAINT `fk_ia_task_config_updater` FOREIGN KEY (`updated_by`) REFERENCES `contacts`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ia_prompts` ADD CONSTRAINT `fk_ia_prompt_creator` FOREIGN KEY (`created_by`) REFERENCES `contacts`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ia_executions` ADD CONSTRAINT `fk_ia_exec_company` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ia_executions` ADD CONSTRAINT `fk_ia_exec_file_job` FOREIGN KEY (`file_job_id`) REFERENCES `file_jobs`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `files` ADD CONSTRAINT `fk_files_company` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `files` ADD CONSTRAINT `fk_files_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `contacts`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `file_intakes` ADD CONSTRAINT `fk_file_intake_file` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `file_intakes` ADD CONSTRAINT `fk_file_intake_receiver` FOREIGN KEY (`received_by`) REFERENCES `contacts`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `file_jobs` ADD CONSTRAINT `fk_file_jobs_file` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `file_jobs` ADD CONSTRAINT `fk_file_jobs_intake` FOREIGN KEY (`intake_id`) REFERENCES `file_intakes`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `file_artifacts` ADD CONSTRAINT `fk_file_artifact_job` FOREIGN KEY (`file_job_id`) REFERENCES `file_jobs`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `file_events` ADD CONSTRAINT `fk_file_events_file` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `file_events` ADD CONSTRAINT `fk_file_events_intake` FOREIGN KEY (`intake_id`) REFERENCES `file_intakes`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `file_events` ADD CONSTRAINT `fk_file_events_job` FOREIGN KEY (`file_job_id`) REFERENCES `file_jobs`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `file_events` ADD CONSTRAINT `fk_file_events_actor` FOREIGN KEY (`actor_contact_id`) REFERENCES `contacts`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

