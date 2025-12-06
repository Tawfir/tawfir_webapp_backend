-- Create platform_metrics table to store calculated platform statistics
-- This table will always have a single row with id = 1
CREATE TABLE IF NOT EXISTS platform_metrics (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    total_restaurants BIGINT NOT NULL DEFAULT 0,
    total_users BIGINT NOT NULL DEFAULT 0,
    orders_processed BIGINT NOT NULL DEFAULT 0,
    co2_saved_kg DECIMAL(12, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Handle initial row insertion based on which columns exist
DO $$
BEGIN
    -- Check if table has co2_saved_kg column (new schema)
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'platform_metrics' 
        AND column_name = 'co2_saved_kg'
    ) THEN
        -- Insert with co2_saved_kg
        INSERT INTO platform_metrics (id, total_restaurants, total_users, orders_processed, co2_saved_kg, updated_at)
        VALUES (1, 0, 0, 0, 0, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO NOTHING;
    -- Check if table has total_revenue column (old schema)
    ELSIF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'platform_metrics' 
        AND column_name = 'total_revenue'
    ) THEN
        -- Insert with total_revenue (will be renamed by migration 020)
        INSERT INTO platform_metrics (id, total_restaurants, total_users, orders_processed, total_revenue, updated_at)
        VALUES (1, 0, 0, 0, 0, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO NOTHING;
    ELSE
        -- Table doesn't exist or has neither column, insert with co2_saved_kg
        INSERT INTO platform_metrics (id, total_restaurants, total_users, orders_processed, co2_saved_kg, updated_at)
        VALUES (1, 0, 0, 0, 0, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_platform_metrics_updated_at ON platform_metrics;
CREATE TRIGGER update_platform_metrics_updated_at BEFORE UPDATE ON platform_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

