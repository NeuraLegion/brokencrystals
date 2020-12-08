set names 'utf8';
set session_replication_role = 'replica';

create table "user" ("id" serial primary key, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, "email" varchar(255) not null, "password" varchar(255) not null, "first_name" varchar(255) not null, "last_name" varchar(255) not null, "is_admin" bool not null, "photo" bytea null);

create table "testimonial" ("id" serial primary key, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, "name" varchar(255) not null, "title" varchar(255) not null, "message" varchar(255) not null);

set session_replication_role = 'origin';
--password is admin
INSERT INTO public."user" (created_at, updated_at, email, password, first_name, last_name, is_admin, photo) VALUES (now(), now(), 'admin', '$2b$10$BBJjmVNNdyEgv7pV/zQR9u/ssIuwZsdDJbowW/Dgp28uws3GmO0Ky', 'admin', 'admin', false, null);