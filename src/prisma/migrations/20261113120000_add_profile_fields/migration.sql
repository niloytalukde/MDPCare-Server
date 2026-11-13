-- =====================================================================
-- Migration: add_profile_fields   (ADD-ONLY: 7 new optional columns)
--   User:            dateOfBirth, profileImageUrl   (personal details, shared by all)
--   ProviderProfile: profession, address, city, state, pincode
-- =====================================================================

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "profession" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "profileImageUrl" TEXT;
