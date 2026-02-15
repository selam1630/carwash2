-- Seed four subscription plans
INSERT INTO plans (id, name, "washesPerMonth", price, "isActive", "createdAt") VALUES
  (gen_random_uuid(), 'Monthly 4', 4, 10.00, true, now()),
  (gen_random_uuid(), 'Monthly 6', 6, 14.00, true, now()),
  (gen_random_uuid(), 'Monthly 8', 8, 18.00, true, now()),
  (gen_random_uuid(), 'Unlimited', 9999, 25.00, true, now());
