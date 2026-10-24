-- Hourly AI admission was removed. Keep the execution ledger for auditing,
-- but drop the now-unused index that existed only for the hourly cap query.
DROP INDEX IF EXISTS execution_attempts_hourly_idx;
