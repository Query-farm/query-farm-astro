-- Fixtures for radio cookbook examples.
-- Most radio_* recipes need a real WebSocket / Redis Pub/Sub server,
-- so they remain EXEC-SKIP. This file is reserved for any future
-- recipes that reference local DuckDB tables.
--
-- (No tables required at present — recipes either call radio_*
-- functions directly or reference columns produced by the extension's
-- own table functions.)
SELECT 1 WHERE 1 = 0;
