-- Make car photo columns nullable so owner registration can omit them
ALTER TABLE owner_profiles ALTER COLUMN "carFrontPhoto" DROP NOT NULL;
ALTER TABLE owner_profiles ALTER COLUMN "carBackPhoto" DROP NOT NULL;
