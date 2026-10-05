ALTER TABLE `ronda_schedule` ADD `user_id` integer REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `house_id` integer REFERENCES houses(id) ON DELETE SET NULL;--> statement-breakpoint
-- Hubungkan jadwal yang sudah ada dengan akun petugas bernama sama (hasil seed/impor).
-- Nama kembar dari seed memakai rumahnya, mis. "Wawan (AD-5)".
UPDATE `ronda_schedule` SET `user_id` = (
  SELECT u.`id` FROM `users` u
  WHERE lower(u.`name`) IN (
    lower(`ronda_schedule`.`name`),
    lower(`ronda_schedule`.`name` || ' (' || `ronda_schedule`.`block` || '-' || `ronda_schedule`.`number` || ')')
  )
  ORDER BY length(u.`name`) DESC
  LIMIT 1
) WHERE `name` IS NOT NULL;--> statement-breakpoint
-- Rumah petugas = rumah di jadwalnya.
UPDATE `users` SET `house_id` = (
  SELECT h.`id` FROM `ronda_schedule` s
  JOIN `houses` h ON h.`block` = s.`block` AND h.`number` = s.`number`
  WHERE s.`user_id` = `users`.`id`
  ORDER BY s.`day_of_week`, s.`position`
  LIMIT 1
) WHERE `house_id` IS NULL;
