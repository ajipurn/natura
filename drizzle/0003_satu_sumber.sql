-- Satu sumber data: nama warga yang punya akun petugas hanya disimpan di akunnya, dan jadwal
-- menunjuk akun atau rumah lewat id (tidak lagi menyalin nama dan blok/nomor).

-- 1. Nama akun tidak perlu memuat rumahnya lagi ("Wawan (AD-5)" → "Wawan"); nama boleh kembar.
DROP INDEX `users_name_unique`;--> statement-breakpoint
UPDATE `users` SET `name` = substr(`name`, 1, length(`name`) - length(
  (SELECT ' (' || h.`block` || '-' || h.`number` || ')' FROM `houses` h WHERE h.`id` = `users`.`house_id`)
))
WHERE `house_id` IS NOT NULL
  AND length(`name`) > length((SELECT ' (' || h.`block` || '-' || h.`number` || ')' FROM `houses` h WHERE h.`id` = `users`.`house_id`))
  AND substr(`name`, -length((SELECT ' (' || h.`block` || '-' || h.`number` || ')' FROM `houses` h WHERE h.`id` = `users`.`house_id`)))
    = (SELECT ' (' || h.`block` || '-' || h.`number` || ')' FROM `houses` h WHERE h.`id` = `users`.`house_id`);--> statement-breakpoint

-- 2. Nama KK di data rumah yang lebih lengkap dari nama akun penghuninya ikut dipakai akun itu,
--    mis. akun "Situmorang" di rumah "Pak Agus Situmorang".
UPDATE `users` SET `name` = (SELECT h.`owner_name` FROM `houses` h WHERE h.`id` = `users`.`house_id`)
WHERE `house_id` IS NOT NULL
  AND (SELECT count(*) FROM `users` u WHERE u.`house_id` = `users`.`house_id`) = 1
  AND EXISTS (
    SELECT 1 FROM `houses` h
    WHERE h.`id` = `users`.`house_id`
      AND h.`owner_name` IS NOT NULL
      AND length(h.`owner_name`) <= 40
      AND lower(h.`owner_name`) <> lower(`users`.`name`)
      AND instr(lower(h.`owner_name`), lower(`users`.`name`)) > 0
  );--> statement-breakpoint

-- 3. Nama di jadwal untuk rumah tanpa akun jadi nama KK rumah itu (kalau masih kosong).
UPDATE `houses` SET `owner_name` = (
  SELECT s.`name` FROM `ronda_schedule` s
  WHERE s.`user_id` IS NULL AND s.`name` IS NOT NULL AND s.`block` = `houses`.`block` AND s.`number` = `houses`.`number`
  ORDER BY s.`day_of_week`, s.`position`
  LIMIT 1
)
WHERE `owner_name` IS NULL
  AND NOT EXISTS (SELECT 1 FROM `users` u WHERE u.`house_id` = `houses`.`id`)
  AND EXISTS (
    SELECT 1 FROM `ronda_schedule` s
    WHERE s.`user_id` IS NULL AND s.`name` IS NOT NULL AND s.`block` = `houses`.`block` AND s.`number` = `houses`.`number`
  );--> statement-breakpoint

-- 4. Rumah yang dihuni petugas memakai nama akunnya, jadi nama KK-nya sendiri dikosongkan.
UPDATE `houses` SET `owner_name` = NULL WHERE EXISTS (SELECT 1 FROM `users` u WHERE u.`house_id` = `houses`.`id`);--> statement-breakpoint

-- 5. Jadwal: tiap baris menunjuk tepat satu dari akun, rumah, atau nama bebas.
--    Baris rumah yang dihuni satu petugas jadi baris petugas itu. Kode rumah yang tidak terdaftar
--    disimpan sebagai nama, mis. "Apri (C-1)".
CREATE TABLE `__new_ronda_schedule` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day_of_week` integer NOT NULL,
	`position` integer NOT NULL,
	`user_id` integer,
	`house_id` integer,
	`name` text,
	`color` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`house_id`) REFERENCES `houses`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ronda_schedule_one_source" CHECK((user_id is not null) + (house_id is not null) + (name is not null) = 1)
);
--> statement-breakpoint
INSERT INTO `__new_ronda_schedule` (`id`, `day_of_week`, `position`, `user_id`, `house_id`, `name`, `color`)
SELECT `id`, `day_of_week`, `position`, `uid`,
  CASE WHEN `uid` IS NULL THEN `hid` END,
  CASE
    WHEN `uid` IS NOT NULL OR `hid` IS NOT NULL THEN NULL
    WHEN `block` = '' THEN coalesce(`name`, '?')
    WHEN `name` IS NULL THEN `block` || '-' || `number`
    ELSE `name` || ' (' || `block` || '-' || `number` || ')'
  END,
  `color`
FROM (
  SELECT s.*, h.`id` AS `hid`,
    coalesce(s.`user_id`, (
      SELECT u.`id` FROM `users` u
      WHERE u.`house_id` = h.`id` AND (SELECT count(*) FROM `users` u2 WHERE u2.`house_id` = h.`id`) = 1
    )) AS `uid`
  FROM `ronda_schedule` s
  LEFT JOIN `houses` h ON h.`block` = s.`block` AND h.`number` = s.`number`
);--> statement-breakpoint
DROP TABLE `ronda_schedule`;--> statement-breakpoint
ALTER TABLE `__new_ronda_schedule` RENAME TO `ronda_schedule`;--> statement-breakpoint
CREATE INDEX `ronda_schedule_day_idx` ON `ronda_schedule` (`day_of_week`,`position`);
