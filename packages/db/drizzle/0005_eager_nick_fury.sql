CREATE TABLE `game_weather` (
	`season` integer NOT NULL,
	`game_id` text NOT NULL,
	`week` integer NOT NULL,
	`kickoff_utc` text NOT NULL,
	`status` text NOT NULL,
	`temperature_f` real,
	`wind_mph` real,
	`gust_mph` real,
	`precip_probability` real,
	`precip_type` text,
	`fetched_at` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`season`, `game_id`)
);
--> statement-breakpoint
CREATE INDEX `game_weather_week_idx` ON `game_weather` (`season`,`week`);--> statement-breakpoint
ALTER TABLE `schedule` ADD `stadium_id` text;