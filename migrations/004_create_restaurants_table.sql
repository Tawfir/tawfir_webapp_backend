-- Create restaurants table
CREATE TABLE IF NOT EXISTS restaurants (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(255) NULL,
    lat DECIMAL(10, 7) NULL,
    lng DECIMAL(10, 7) NULL,
    place_pics JSONB NULL,
    profile_pic VARCHAR(255) NULL,
    cover_image VARCHAR(255) NULL,
    working_hours JSONB NULL,
    public_phone VARCHAR(255) NULL,
    private_phone VARCHAR(255) NULL,
    status VARCHAR(255) NOT NULL DEFAULT 'pending',
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    stripe_account_id VARCHAR(255) NULL,
    stripe_account_details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
    payout_method VARCHAR(255) NOT NULL DEFAULT 'manual',
    bank_name VARCHAR(255) NULL,
    account_holder VARCHAR(255) NULL,
    iban VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_restaurants_user_id ON restaurants(user_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_status ON restaurants(status);
CREATE INDEX IF NOT EXISTS idx_restaurants_is_featured ON restaurants(is_featured);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_restaurants_updated_at ON restaurants;
CREATE TRIGGER update_restaurants_updated_at BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

