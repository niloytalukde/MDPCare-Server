-- CreateEnum
CREATE TYPE "AgencyStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AgencyVerificationStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AgencyAvailabilityStatus" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "AgencyMemberRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "AgencyMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "AgencyInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgencyDocumentType" AS ENUM ('BUSINESS_LICENSE', 'GST_CERTIFICATE', 'PAN_CARD', 'OWNER_ID_PROOF', 'ADDRESS_PROOF', 'BANK_PROOF', 'CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "AgencyDocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AgencyAssignmentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'REJECTED', 'STARTED', 'COMPLETED', 'CANCELLED', 'REASSIGNED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE', 'CASH');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "BookingCancellationActor" ADD VALUE 'AGENCY';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRoleType" ADD VALUE 'AGENCY_OWNER';
ALTER TYPE "UserRoleType" ADD VALUE 'AGENCY_STAFF';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "agencyId" INTEGER,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProviderOTP" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderOTP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agency" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "legalName" TEXT,
    "registrationNumber" TEXT,
    "gstNumber" TEXT,
    "panNumber" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "alternatePhone" TEXT,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "pincode" TEXT NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "serviceRadiusKm" INTEGER NOT NULL DEFAULT 10,
    "logoUrl" TEXT,
    "coverImageUrl" TEXT,
    "website" TEXT,
    "status" "AgencyStatus" NOT NULL DEFAULT 'PENDING',
    "verificationStatus" "AgencyVerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "availabilityStatus" "AgencyAvailabilityStatus" NOT NULL DEFAULT 'OFFLINE',
    "rejectionReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "averageRating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "completedBookings" INTEGER NOT NULL DEFAULT 0,
    "cancelledBookings" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyMember" (
    "id" SERIAL NOT NULL,
    "agencyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "AgencyMemberRole" NOT NULL DEFAULT 'STAFF',
    "status" "AgencyMemberStatus" NOT NULL DEFAULT 'INVITED',
    "displayName" TEXT,
    "phone" TEXT,
    "profileImageUrl" TEXT,
    "experienceYears" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyInvitation" (
    "id" SERIAL NOT NULL,
    "agencyId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "invitedById" INTEGER NOT NULL,
    "status" "AgencyInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyDocument" (
    "id" SERIAL NOT NULL,
    "agencyId" INTEGER NOT NULL,
    "type" "AgencyDocumentType" NOT NULL,
    "documentNumber" TEXT,
    "fileUrl" TEXT NOT NULL,
    "status" "AgencyDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyService" (
    "id" SERIAL NOT NULL,
    "agencyId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "customPrice" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyStaffService" (
    "id" SERIAL NOT NULL,
    "agencyMemberId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyStaffService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAgency" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "agencyId" INTEGER NOT NULL,
    "searchRound" INTEGER NOT NULL,
    "distanceKm" DECIMAL(8,3) NOT NULL,
    "status" "BookingRequestStatus" NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingAgency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyBookingAssignment" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "agencyId" INTEGER NOT NULL,
    "staffMemberId" INTEGER NOT NULL,
    "assignedById" INTEGER NOT NULL,
    "status" "AgencyAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyBookingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyAssignmentHistory" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "agencyId" INTEGER NOT NULL,
    "staffMemberId" INTEGER NOT NULL,
    "actorMemberId" INTEGER,
    "status" "AgencyAssignmentStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyAssignmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyAvailability" (
    "id" SERIAL NOT NULL,
    "agencyId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyWallet" (
    "id" SERIAL NOT NULL,
    "agencyId" INTEGER NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pendingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalEarnings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalWithdrawn" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyWalletTransaction" (
    "id" SERIAL NOT NULL,
    "walletId" INTEGER NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "reason" "WalletTransactionReason" NOT NULL,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceBefore" DECIMAL(14,2),
    "balanceAfter" DECIMAL(14,2),
    "bookingId" INTEGER,
    "referenceId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyWalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyWalletPayout" (
    "id" SERIAL NOT NULL,
    "walletId" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "bankReference" TEXT,
    "paymentReference" TEXT,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyWalletPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderOTP_phone_createdAt_idx" ON "ProviderOTP"("phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Agency_slug_key" ON "Agency"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Agency_registrationNumber_key" ON "Agency"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Agency_gstNumber_key" ON "Agency"("gstNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Agency_panNumber_key" ON "Agency"("panNumber");

-- CreateIndex
CREATE INDEX "Agency_status_verificationStatus_idx" ON "Agency"("status", "verificationStatus");

-- CreateIndex
CREATE INDEX "Agency_status_availabilityStatus_idx" ON "Agency"("status", "availabilityStatus");

-- CreateIndex
CREATE INDEX "Agency_city_state_idx" ON "Agency"("city", "state");

-- CreateIndex
CREATE INDEX "Agency_latitude_longitude_idx" ON "Agency"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "AgencyMember_agencyId_role_status_idx" ON "AgencyMember"("agencyId", "role", "status");

-- CreateIndex
CREATE INDEX "AgencyMember_userId_status_idx" ON "AgencyMember"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyMember_agencyId_userId_key" ON "AgencyMember"("agencyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyInvitation_tokenHash_key" ON "AgencyInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "AgencyInvitation_phone_status_idx" ON "AgencyInvitation"("phone", "status");

-- CreateIndex
CREATE INDEX "AgencyInvitation_agencyId_status_idx" ON "AgencyInvitation"("agencyId", "status");

-- CreateIndex
CREATE INDEX "AgencyInvitation_invitedById_idx" ON "AgencyInvitation"("invitedById");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyInvitation_agencyId_phone_key" ON "AgencyInvitation"("agencyId", "phone");

-- CreateIndex
CREATE INDEX "AgencyDocument_agencyId_type_idx" ON "AgencyDocument"("agencyId", "type");

-- CreateIndex
CREATE INDEX "AgencyDocument_status_idx" ON "AgencyDocument"("status");

-- CreateIndex
CREATE INDEX "AgencyService_serviceId_isActive_idx" ON "AgencyService"("serviceId", "isActive");

-- CreateIndex
CREATE INDEX "AgencyService_agencyId_isActive_idx" ON "AgencyService"("agencyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyService_agencyId_serviceId_key" ON "AgencyService"("agencyId", "serviceId");

-- CreateIndex
CREATE INDEX "AgencyStaffService_serviceId_isActive_idx" ON "AgencyStaffService"("serviceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyStaffService_agencyMemberId_serviceId_key" ON "AgencyStaffService"("agencyMemberId", "serviceId");

-- CreateIndex
CREATE INDEX "BookingAgency_agencyId_status_idx" ON "BookingAgency"("agencyId", "status");

-- CreateIndex
CREATE INDEX "BookingAgency_bookingId_searchRound_idx" ON "BookingAgency"("bookingId", "searchRound");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAgency_bookingId_agencyId_key" ON "BookingAgency"("bookingId", "agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyBookingAssignment_bookingId_key" ON "AgencyBookingAssignment"("bookingId");

-- CreateIndex
CREATE INDEX "AgencyBookingAssignment_agencyId_status_idx" ON "AgencyBookingAssignment"("agencyId", "status");

-- CreateIndex
CREATE INDEX "AgencyBookingAssignment_staffMemberId_status_idx" ON "AgencyBookingAssignment"("staffMemberId", "status");

-- CreateIndex
CREATE INDEX "AgencyBookingAssignment_assignedById_idx" ON "AgencyBookingAssignment"("assignedById");

-- CreateIndex
CREATE INDEX "AgencyAssignmentHistory_bookingId_createdAt_idx" ON "AgencyAssignmentHistory"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "AgencyAssignmentHistory_assignmentId_idx" ON "AgencyAssignmentHistory"("assignmentId");

-- CreateIndex
CREATE INDEX "AgencyAssignmentHistory_agencyId_createdAt_idx" ON "AgencyAssignmentHistory"("agencyId", "createdAt");

-- CreateIndex
CREATE INDEX "AgencyAssignmentHistory_staffMemberId_idx" ON "AgencyAssignmentHistory"("staffMemberId");

-- CreateIndex
CREATE INDEX "AgencyAssignmentHistory_actorMemberId_idx" ON "AgencyAssignmentHistory"("actorMemberId");

-- CreateIndex
CREATE INDEX "AgencyAvailability_agencyId_dayOfWeek_isActive_idx" ON "AgencyAvailability"("agencyId", "dayOfWeek", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyWallet_agencyId_key" ON "AgencyWallet"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyWalletTransaction_referenceId_key" ON "AgencyWalletTransaction"("referenceId");

-- CreateIndex
CREATE INDEX "AgencyWalletTransaction_walletId_createdAt_idx" ON "AgencyWalletTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "AgencyWalletTransaction_bookingId_idx" ON "AgencyWalletTransaction"("bookingId");

-- CreateIndex
CREATE INDEX "AgencyWalletTransaction_status_idx" ON "AgencyWalletTransaction"("status");

-- CreateIndex
CREATE INDEX "AgencyWalletPayout_walletId_status_idx" ON "AgencyWalletPayout"("walletId", "status");

-- CreateIndex
CREATE INDEX "Address_userId_isDefault_idx" ON "Address"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "Booking_agencyId_status_idx" ON "Booking"("agencyId", "status");

-- CreateIndex
CREATE INDEX "Booking_addressId_idx" ON "Booking"("addressId");

-- CreateIndex
CREATE INDEX "Booking_familyMemberId_idx" ON "Booking"("familyMemberId");

-- CreateIndex
CREATE INDEX "FamilyMember_userId_idx" ON "FamilyMember"("userId");

-- AddForeignKey
ALTER TABLE "AgencyMember" ADD CONSTRAINT "AgencyMember_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyMember" ADD CONSTRAINT "AgencyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyInvitation" ADD CONSTRAINT "AgencyInvitation_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyInvitation" ADD CONSTRAINT "AgencyInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "AgencyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyDocument" ADD CONSTRAINT "AgencyDocument_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyService" ADD CONSTRAINT "AgencyService_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyService" ADD CONSTRAINT "AgencyService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyStaffService" ADD CONSTRAINT "AgencyStaffService_agencyMemberId_fkey" FOREIGN KEY ("agencyMemberId") REFERENCES "AgencyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyStaffService" ADD CONSTRAINT "AgencyStaffService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAgency" ADD CONSTRAINT "BookingAgency_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAgency" ADD CONSTRAINT "BookingAgency_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyBookingAssignment" ADD CONSTRAINT "AgencyBookingAssignment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyBookingAssignment" ADD CONSTRAINT "AgencyBookingAssignment_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyBookingAssignment" ADD CONSTRAINT "AgencyBookingAssignment_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "AgencyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyBookingAssignment" ADD CONSTRAINT "AgencyBookingAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "AgencyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyAssignmentHistory" ADD CONSTRAINT "AgencyAssignmentHistory_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "AgencyBookingAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyAssignmentHistory" ADD CONSTRAINT "AgencyAssignmentHistory_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyAssignmentHistory" ADD CONSTRAINT "AgencyAssignmentHistory_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyAssignmentHistory" ADD CONSTRAINT "AgencyAssignmentHistory_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "AgencyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyAssignmentHistory" ADD CONSTRAINT "AgencyAssignmentHistory_actorMemberId_fkey" FOREIGN KEY ("actorMemberId") REFERENCES "AgencyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyAvailability" ADD CONSTRAINT "AgencyAvailability_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyWallet" ADD CONSTRAINT "AgencyWallet_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyWalletTransaction" ADD CONSTRAINT "AgencyWalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "AgencyWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyWalletTransaction" ADD CONSTRAINT "AgencyWalletTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyWalletPayout" ADD CONSTRAINT "AgencyWalletPayout_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "AgencyWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------
-- Manual: business invariant (not expressible in Prisma schema)
-- A booking can belong to an individual provider OR an agency, never both.
-- Fails safely (migration aborts, nothing changes) if a violating row exists.
-- ---------------------------------------------------------------
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_single_assignee_chk"
  CHECK (NOT ("providerId" IS NOT NULL AND "agencyId" IS NOT NULL));
