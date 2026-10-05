CREATE TABLE `collection_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` text,
	`date` text NOT NULL,
	`house_id` integer NOT NULL,
	`user_id` integer,
	`status` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`on_duty` integer,
	`recorded_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`house_id`) REFERENCES `houses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `collection_logs_date_idx` ON `collection_logs` (`date`,`recorded_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_logs_client_idx` ON `collection_logs` (`client_id`);