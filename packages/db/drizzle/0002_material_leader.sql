CREATE TABLE `player_news` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`headline` text NOT NULL,
	`summary` text,
	`url` text,
	`source` text NOT NULL,
	`published_at` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `player_news_player_idx` ON `player_news` (`player_id`,"published_at" desc);--> statement-breakpoint
CREATE INDEX `player_news_published_idx` ON `player_news` (`published_at`);--> statement-breakpoint
ALTER TABLE `players` ADD `espn_id` text;--> statement-breakpoint
ALTER TABLE `sync_requests` ADD `target` text;