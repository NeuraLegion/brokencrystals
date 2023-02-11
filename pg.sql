set names 'utf8';
set session_replication_role = 'replica';

create table "user" ("id" serial primary key, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, "email" varchar(255) not null, "password" varchar(255) not null, "first_name" varchar(255) not null, "last_name" varchar(255) not null, "is_admin" bool not null, "photo" bytea null, "company" varchar(255) not null, "card_number" varchar(255) not null, "phone_number" varchar(255) not null);

create table "testimonial" ("id" serial primary key, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, "name" varchar(255) not null, "title" varchar(255) not null, "message" varchar(255) not null);

create table "product" ("id" serial primary key, "created_at" timestamptz(0) not null default now(), "category" varchar(255) not null, "photo_url" varchar(255) not null, "name" varchar(255) not null, "description" varchar(255) null, "views_count" int DEFAULT 0);

set session_replication_role = 'origin';
--password is admin
INSERT INTO "user" (created_at, updated_at, email, password, first_name, last_name, is_admin, photo, company, card_number, phone_number) VALUES (now(), now(), 'admin', '$2b$10$BBJjmVNNdyEgv7pV/zQR9u/ssIuwZsdDJbowW/Dgp28uws3GmO0Ky', 'admin', 'admin', true, null, 'Brightsec', '1234 5678 9012 3456', '+1 234 567 890');
INSERT INTO "user" (created_at, updated_at, email, password, first_name, last_name, is_admin, photo, company, card_number, phone_number) VALUES (now(), now(), 'user', '$2b$10$edsq4aqzAHnrJu68t8GS2.v0Z7hJSstAo7wBBDmmbpjYGxMMTYpVi', 'user', 'user', false, null, 'Brightsec', '1234 5678 9012 3456', '+1 234 567 890');

--insert default products into the table
INSERT INTO "product" ("category", "photo_url", "name", "description") VALUES ('Healing', '/api/file?path=config/products/crystals/amethyst.jpg&type=image/jpg', 'Amethyst', 'a violet variety of quartz');
INSERT INTO "product" ("category", "photo_url", "name", "description") VALUES ('Gemstones', '/api/file?path=config/products/crystals/ruby.jpg&type=image/jpg', 'Ruby', 'an intense heart crystal');
INSERT INTO "product" ("category", "photo_url", "name", "description") VALUES ('Healing', '/api/file?path=config/products/crystals/opal.jpg&type=image/jpg', 'Opal', 'the precious stone');
INSERT INTO "product" ("category", "photo_url", "name", "description") VALUES ('Jewellery', '/api/file?path=config/products/crystals/sapphire.jpg&type=image/jpg', 'Sapphire', '');
INSERT INTO "product" ("category", "photo_url", "name", "description") VALUES ('Healing', '/api/file?path=config/products/crystals/amber.jpg&type=image/jpg', 'Amber', 'fossilized tree resin');
INSERT INTO "product" ("category", "photo_url", "name", "description") VALUES ('Jewellery', '/api/file?path=config/products/crystals/emerald.jpg&type=image/jpg', 'Emerald', 'symbol of fertility and life');
INSERT INTO "product" ("category", "photo_url", "name", "description") VALUES ('Jewellery', '/api/file?path=config/products/crystals/shattuckite.jpg&type=image/jpg', 'Shattuckite', 'mistery');
INSERT INTO "product" ("category", "photo_url", "name", "description") VALUES ('Gemstones', '/api/file?path=config/products/crystals/bismuth.jpg&type=image/jpg', 'Bismuth', 'rainbow');
CREATE INDEX IF NOT EXISTS "IDX_users_email" ON "user" ("email");
