-- Create food_category_restaurant pivot table
CREATE TABLE IF NOT EXISTS food_category_restaurant (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL,
    food_category_id BIGINT NOT NULL,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
    FOREIGN KEY (food_category_id) REFERENCES food_categories(id) ON DELETE CASCADE,
    UNIQUE(restaurant_id, food_category_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_food_category_restaurant_restaurant_id ON food_category_restaurant(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_food_category_restaurant_food_category_id ON food_category_restaurant(food_category_id);

