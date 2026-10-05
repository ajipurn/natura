CREATE TABLE `announcements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`pinned` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patrol_id` integer NOT NULL,
	`house_id` integer NOT NULL,
	`status` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`collected_by` integer,
	`recorded_at` integer NOT NULL,
	`synced_at` integer NOT NULL,
	FOREIGN KEY (`patrol_id`) REFERENCES `patrols`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`house_id`) REFERENCES `houses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`collected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_patrol_house_idx` ON `collections` (`patrol_id`,`house_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`phone` text NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `houses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block` text NOT NULL,
	`number` text NOT NULL,
	`owner_name` text,
	`token` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `houses_token_unique` ON `houses` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `houses_block_number_idx` ON `houses` (`block`,`number`);--> statement-breakpoint
CREATE TABLE `patrols` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patrols_date_unique` ON `patrols` (`date`);--> statement-breakpoint
CREATE TABLE `ronda_schedule` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day_of_week` integer NOT NULL,
	`position` integer NOT NULL,
	`name` text,
	`block` text NOT NULL,
	`number` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ronda_schedule_day_idx` ON `ronda_schedule` (`day_of_week`,`position`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`community_name` text NOT NULL,
	`default_amount` integer NOT NULL,
	`warga_code` text,
	`warga_code_version` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`pin_hash` text NOT NULL,
	`role` text NOT NULL,
	`active` integer NOT NULL,
	`failed_attempts` integer NOT NULL,
	`locked_until` integer,
	`session_version` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);