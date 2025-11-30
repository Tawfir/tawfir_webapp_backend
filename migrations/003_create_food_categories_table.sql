-- Create food_categories table
CREATE TABLE IF NOT EXISTS food_categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    image VARCHAR(255) NULL,
    cover VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_food_categories_slug ON food_categories(slug);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_food_categories_updated_at ON food_categories;
CREATE TRIGGER update_food_categories_updated_at BEFORE UPDATE ON food_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

