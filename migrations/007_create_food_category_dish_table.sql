-- Create food_category_dish pivot table
CREATE TABLE IF NOT EXISTS food_category_dish (
    id BIGSERIAL PRIMARY KEY,
    dish_id BIGINT NOT NULL,
    food_category_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE,
    FOREIGN KEY (food_category_id) REFERENCES food_categories(id) ON DELETE CASCADE,
    UNIQUE(dish_id, food_category_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_food_category_dish_dish_id ON food_category_dish(dish_id);
CREATE INDEX IF NOT EXISTS idx_food_category_dish_food_category_id ON food_category_dish(food_category_id);

-- Create trigger for updated_at
CREATE TRIGGER update_food_category_dish_updated_at BEFORE UPDATE ON food_category_dish
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

