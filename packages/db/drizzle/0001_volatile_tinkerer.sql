CREATE TABLE `user_leagues` (
	`user_id` text NOT NULL,
	`league_id` text NOT NULL,
	`season` integer NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`total_rosters` integer NOT NULL,
	`avatar` text,
	`synced_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `league_id`, `season`)
);
--> statement-breakpoint
ALTER TABLE `sync_requests` ADD `params_json` text;