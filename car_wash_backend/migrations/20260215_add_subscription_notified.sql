-- Add notified boolean to owner_subscriptions for notification tracking
ALTER TABLE owner_subscriptions ADD COLUMN IF NOT EXISTS notified boolean DEFAULT false;
