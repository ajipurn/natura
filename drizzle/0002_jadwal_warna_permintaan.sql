CREATE TABLE `schedule_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`from_day` integer,
	`to_day` integer NOT NULL,
	`note` text,
	`status` text NOT NULL,
	`response` text,
	`decided_by` integer,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `schedule_requests_status_idx` ON `schedule_requests` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `ronda_schedule` ADD `color` text;