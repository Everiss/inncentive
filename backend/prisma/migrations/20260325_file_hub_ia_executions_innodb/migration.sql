ALTER TABLE `ia_executions` ENGINE=InnoDB;

ALTER TABLE `ia_executions`
  ADD CONSTRAINT `fk_ia_exec_company` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  ADD CONSTRAINT `fk_ia_exec_file_job` FOREIGN KEY (`file_job_id`) REFERENCES `file_jobs`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;