-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('ADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'OPERATIONS', 'VIEWER');

-- CreateEnum
CREATE TYPE "StoreProvider" AS ENUM ('SHOPIFY', 'MANUAL');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InventoryItemKind" AS ENUM ('FINISHED_GOOD', 'RAW_MATERIAL', 'PACKAGING', 'CONSUMABLE', 'SEMI_FINISHED');

-- CreateEnum
CREATE TYPE "SupplyMode" AS ENUM ('MADE_TO_ORDER', 'FROM_STOCK');

-- CreateEnum
CREATE TYPE "BomStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "FacilityStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "FacilityRole" AS ENUM ('MANAGER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "FacilityLocationType" AS ENUM ('STORAGE', 'STAGING');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AddressValidationStatus" AS ENUM ('UNVERIFIED', 'VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "IngestionSource" AS ENUM ('SHOPIFY_WEBHOOK', 'API', 'CSV');

-- CreateEnum
CREATE TYPE "IngestionRecordStatus" AS ENUM ('PENDING', 'HELD', 'ACCEPTED', 'DUPLICATE', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "FulfillmentKind" AS ENUM ('ORIGINAL', 'REPLACEMENT');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('QUEUED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'PARTIALLY_SHIPPED', 'SHIPPED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RoutingDecisionStatus" AS ENUM ('SELECTED', 'NO_ROUTE');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "InventoryMovementReason" AS ENUM ('RECEIPT', 'ADJUSTMENT', 'RESERVE', 'RELEASE', 'CONSUME', 'RETURN', 'DAMAGE');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'LABEL_PURCHASED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION', 'VOIDED');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ExceptionVisibility" AS ENUM ('MERCHANT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ExceptionCode" AS ENUM ('SKU_NOT_MAPPED', 'INVALID_ADDRESS', 'ADDRESS_CHANGED_AFTER_SHIP', 'CANCELLATION_CONFLICT', 'PRICE_NOT_FOUND', 'POLICY_HOLD', 'NO_ELIGIBLE_FACILITY', 'INSUFFICIENT_STOCK', 'PRODUCTION_BLOCKED', 'SHIPPING_FAILED', 'CHANNEL_SYNC_FAILED', 'LEDGER_DRIFT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ResolutionAction" AS ENUM ('RETRY', 'IGNORE', 'MANUAL');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "ApiIdempotencyKey" (
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiIdempotencyKey_pkey" PRIMARY KEY ("organizationId","key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "correlationId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomComponent" (
    "id" TEXT NOT NULL,
    "bomRevisionId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantityPerUnit" DECIMAL(18,6) NOT NULL,
    "wastageRate" DECIMAL(8,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BomComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomRevision" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "BomStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "activatedAt" TIMESTAMPTZ(3),
    "retiredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BomRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAttempt" (
    "id" TEXT NOT NULL,
    "outboxEventId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "httpStatus" INTEGER,
    "responseExcerpt" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionCase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" "ExceptionCode" NOT NULL,
    "visibility" "ExceptionVisibility" NOT NULL DEFAULT 'INTERNAL',
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "subjectKey" TEXT NOT NULL,
    "ingestionRecordId" TEXT,
    "orderId" TEXT,
    "fulfillmentId" TEXT,
    "shipmentId" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "assignedToId" TEXT,
    "resolvedById" TEXT,
    "resolutionAction" "ResolutionAction",
    "resolvedAt" TIMESTAMPTZ(3),
    "correlationId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExceptionCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityLocation" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "FacilityLocationType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityMembership" (
    "facilityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "FacilityRole" NOT NULL,

    CONSTRAINT "FacilityMembership_pkey" PRIMARY KEY ("facilityId","userId")
);

-- CreateTable
CREATE TABLE "FacilitySkuCapability" (
    "facilityId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyCapacity" INTEGER,
    "leadTimeHours" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FacilitySkuCapability_pkey" PRIMARY KEY ("facilityId","skuId")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "FacilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "countryCode" VARCHAR(2) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentItem" (
    "id" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "producedQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FulfillmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fulfillment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "routingDecisionId" TEXT,
    "kind" "FulfillmentKind" NOT NULL DEFAULT 'ORIGINAL',
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'QUEUED',
    "replacesFulfillmentId" TEXT,
    "assignedToId" TEXT,
    "stagingLocationId" TEXT,
    "dueAt" TIMESTAMPTZ(3),
    "productionStartedAt" TIMESTAMPTZ(3),
    "productionCompletedAt" TIMESTAMPTZ(3),
    "shippedAt" TIMESTAMPTZ(3),
    "correlationId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Fulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "source" "IngestionSource" NOT NULL,
    "externalReference" TEXT,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "batchId" TEXT,
    "position" INTEGER,
    "source" "IngestionSource" NOT NULL,
    "topic" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "IngestionRecordStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMPTZ(3),
    "rawPayload" JSONB,
    "normalizedPayload" JSONB,
    "purgedAt" TIMESTAMPTZ(3),
    "resultOrderId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "onHand" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "InventoryItemKind" NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'pcs',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "reason" "InventoryMovementReason" NOT NULL,
    "onHandDelta" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reservedDelta" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "reservationId" TEXT,
    "fulfillmentId" TEXT,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" TEXT NOT NULL,
    "fulfillmentItemId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "bomComponentId" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "consumedQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAddress" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT,
    "postalCode" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "validationStatus" "AddressValidationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "externalLineId" TEXT,
    "externalSku" TEXT,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "fulfillmentUnitPrice" DECIMAL(14,4),
    "artworkUrl" TEXT,
    "customization" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayNumber" TEXT,
    "sourceKey" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "currency" VARCHAR(3) NOT NULL,
    "fulfillmentCurrency" VARCHAR(3),
    "channelFinancialStatus" TEXT,
    "channelUpdatedAt" TIMESTAMPTZ(3),
    "customerName" TEXT,
    "customerEmail" TEXT,
    "placedAt" TIMESTAMPTZ(3) NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "correlationId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("organizationId","userId")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "priceListId" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "eventKey" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "handler" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingDecision" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "RoutingDecisionStatus" NOT NULL,
    "selectedFacilityId" TEXT,
    "strategyVersion" TEXT NOT NULL,
    "candidates" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "shipmentId" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "fulfillmentItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("shipmentId","fulfillmentItemId")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "service" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "labelUrl" TEXT,
    "externalLabelId" TEXT,
    "externalFulfillmentId" TEXT,
    "cost" DECIMAL(14,4),
    "currency" VARCHAR(3),
    "addressSnapshot" JSONB,
    "providerPayload" JSONB,
    "shippedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "voidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyFulfillmentOrderLine" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "fulfillmentOrderId" TEXT NOT NULL,
    "fulfillmentOrderLineItemId" TEXT NOT NULL,
    "remainingQuantity" INTEGER NOT NULL,
    "resolvedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShopifyFulfillmentOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sku" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "attributes" JSONB,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "supplyMode" "SupplyMode" NOT NULL DEFAULT 'MADE_TO_ORDER',
    "unitWeightGrams" DECIMAL(12,3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSkuMapping" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "externalProductId" TEXT,
    "externalVariantId" TEXT NOT NULL,
    "externalSku" TEXT,
    "defaultArtworkUrl" TEXT,
    "defaultCustomization" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StoreSkuMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "StoreProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "externalStoreId" TEXT NOT NULL,
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "accessTokenEnc" BYTEA,
    "refreshTokenEnc" BYTEA,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "grantedScopes" TEXT,
    "installedAt" TIMESTAMPTZ(3),
    "uninstalledAt" TIMESTAMPTZ(3),
    "settings" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "platformRole" "PlatformRole",
    "shopifyUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiIdempotencyKey_expiresAt_idx" ON "ApiIdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "BomComponent_inventoryItemId_idx" ON "BomComponent"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "BomComponent_bomRevisionId_inventoryItemId_key" ON "BomComponent"("bomRevisionId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "BomRevision_skuId_status_idx" ON "BomRevision"("skuId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BomRevision_skuId_version_key" ON "BomRevision"("skuId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "one_active_bom_per_sku" ON "BomRevision"("skuId") WHERE ("status" = 'ACTIVE');

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAttempt_outboxEventId_attempt_key" ON "DeliveryAttempt"("outboxEventId", "attempt");

-- CreateIndex
CREATE INDEX "ExceptionCase_organizationId_visibility_status_createdAt_idx" ON "ExceptionCase"("organizationId", "visibility", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ExceptionCase_assignedToId_status_idx" ON "ExceptionCase"("assignedToId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "one_open_exception_per_subject_code" ON "ExceptionCase"("subjectKey", "code") WHERE ("status" = 'OPEN');

-- CreateIndex
CREATE UNIQUE INDEX "FacilityLocation_facilityId_code_key" ON "FacilityLocation"("facilityId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_code_key" ON "Facility"("code");

-- CreateIndex
CREATE INDEX "FulfillmentItem_orderItemId_idx" ON "FulfillmentItem"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentItem_fulfillmentId_orderItemId_key" ON "FulfillmentItem"("fulfillmentId", "orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentItem_id_fulfillmentId_key" ON "FulfillmentItem"("id", "fulfillmentId");

-- CreateIndex
CREATE INDEX "Fulfillment_facilityId_status_idx" ON "Fulfillment"("facilityId", "status");

-- CreateIndex
CREATE INDEX "fulfillment_active_queue" ON "Fulfillment"("status", "dueAt") WHERE (status IN ('QUEUED','IN_PRODUCTION','READY_TO_SHIP','BLOCKED'));

-- CreateIndex
CREATE UNIQUE INDEX "Fulfillment_id_orderId_key" ON "Fulfillment"("id", "orderId");

-- CreateIndex
CREATE INDEX "IngestionBatch_organizationId_createdAt_idx" ON "IngestionBatch"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionRecord_dedupeKey_key" ON "IngestionRecord"("dedupeKey");

-- CreateIndex
CREATE INDEX "ingestion_pending_queue" ON "IngestionRecord"("nextAttemptAt") WHERE ("status" = 'PENDING');

-- CreateIndex
CREATE INDEX "IngestionRecord_storeId_status_idx" ON "IngestionRecord"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionRecord_batchId_position_key" ON "IngestionRecord"("batchId", "position");

-- CreateIndex
CREATE INDEX "InventoryBalance_inventoryItemId_idx" ON "InventoryBalance"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_facilityId_inventoryItemId_key" ON "InventoryBalance"("facilityId", "inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_code_key" ON "InventoryItem"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_idempotencyKey_key" ON "InventoryMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryMovement_facilityId_inventoryItemId_createdAt_idx" ON "InventoryMovement"("facilityId", "inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_reservationId_idx" ON "InventoryMovement"("reservationId");

-- CreateIndex
CREATE INDEX "InventoryMovement_fulfillmentId_idx" ON "InventoryMovement"("fulfillmentId");

-- CreateIndex
CREATE INDEX "InventoryReservation_facilityId_inventoryItemId_status_idx" ON "InventoryReservation"("facilityId", "inventoryItemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "one_active_reservation_per_item" ON "InventoryReservation"("fulfillmentItemId", "inventoryItemId") WHERE ("status" = 'ACTIVE');

-- CreateIndex
CREATE UNIQUE INDEX "OrderAddress_orderId_key" ON "OrderAddress"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_skuId_idx" ON "OrderItem"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_id_orderId_key" ON "OrderItem"("id", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_externalLineId_key" ON "OrderItem"("orderId", "externalLineId");

-- CreateIndex
CREATE INDEX "Order_organizationId_status_placedAt_idx" ON "Order"("organizationId", "status", "placedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_organizationId_sourceKey_key" ON "Order"("organizationId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_externalId_key" ON "Order"("storeId", "externalId");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_idx" ON "OrganizationMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_eventKey_key" ON "OutboxEvent"("eventKey");

-- CreateIndex
CREATE INDEX "outbox_pending_queue" ON "OutboxEvent"("availableAt") WHERE ("status" = 'PENDING');

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "PriceListItem_skuId_idx" ON "PriceListItem"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_priceListId_skuId_minQuantity_key" ON "PriceListItem"("priceListId", "skuId", "minQuantity");

-- CreateIndex
CREATE UNIQUE INDEX "Product_handle_key" ON "Product"("handle");

-- CreateIndex
CREATE INDEX "RoutingDecision_orderId_createdAt_idx" ON "RoutingDecision"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_fulfillmentId_idx" ON "Shipment"("fulfillmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_id_fulfillmentId_key" ON "Shipment"("id", "fulfillmentId");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_tracking_unique" ON "Shipment"("provider", "trackingNumber") WHERE ("trackingNumber" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyFulfillmentOrderLine_fulfillmentOrderLineItemId_key" ON "ShopifyFulfillmentOrderLine"("fulfillmentOrderLineItemId");

-- CreateIndex
CREATE INDEX "ShopifyFulfillmentOrderLine_orderItemId_idx" ON "ShopifyFulfillmentOrderLine"("orderItemId");

-- CreateIndex
CREATE INDEX "Sku_productId_idx" ON "Sku"("productId");

-- CreateIndex
CREATE INDEX "StoreSkuMapping_storeId_externalSku_idx" ON "StoreSkuMapping"("storeId", "externalSku");

-- CreateIndex
CREATE INDEX "StoreSkuMapping_skuId_idx" ON "StoreSkuMapping"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSkuMapping_storeId_externalVariantId_key" ON "StoreSkuMapping"("storeId", "externalVariantId");

-- CreateIndex
CREATE INDEX "Store_organizationId_idx" ON "Store"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_provider_externalStoreId_key" ON "Store"("provider", "externalStoreId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_shopifyUserId_key" ON "User"("shopifyUserId");

-- AddForeignKey
ALTER TABLE "ApiIdempotencyKey" ADD CONSTRAINT "ApiIdempotencyKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomComponent" ADD CONSTRAINT "BomComponent_bomRevisionId_fkey" FOREIGN KEY ("bomRevisionId") REFERENCES "BomRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomComponent" ADD CONSTRAINT "BomComponent_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomRevision" ADD CONSTRAINT "BomRevision_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_outboxEventId_fkey" FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionCase" ADD CONSTRAINT "ExceptionCase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionCase" ADD CONSTRAINT "ExceptionCase_ingestionRecordId_fkey" FOREIGN KEY ("ingestionRecordId") REFERENCES "IngestionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionCase" ADD CONSTRAINT "ExceptionCase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionCase" ADD CONSTRAINT "ExceptionCase_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "Fulfillment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionCase" ADD CONSTRAINT "ExceptionCase_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionCase" ADD CONSTRAINT "ExceptionCase_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionCase" ADD CONSTRAINT "ExceptionCase_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityLocation" ADD CONSTRAINT "FacilityLocation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityMembership" ADD CONSTRAINT "FacilityMembership_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityMembership" ADD CONSTRAINT "FacilityMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilitySkuCapability" ADD CONSTRAINT "FacilitySkuCapability_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilitySkuCapability" ADD CONSTRAINT "FacilitySkuCapability_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentItem" ADD CONSTRAINT "FulfillmentItem_fulfillmentId_orderId_fkey" FOREIGN KEY ("fulfillmentId", "orderId") REFERENCES "Fulfillment"("id", "orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentItem" ADD CONSTRAINT "FulfillmentItem_orderItemId_orderId_fkey" FOREIGN KEY ("orderItemId", "orderId") REFERENCES "OrderItem"("id", "orderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_replacesFulfillmentId_fkey" FOREIGN KEY ("replacesFulfillmentId") REFERENCES "Fulfillment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_routingDecisionId_fkey" FOREIGN KEY ("routingDecisionId") REFERENCES "RoutingDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_stagingLocationId_fkey" FOREIGN KEY ("stagingLocationId") REFERENCES "FacilityLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionBatch" ADD CONSTRAINT "IngestionBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionBatch" ADD CONSTRAINT "IngestionBatch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRecord" ADD CONSTRAINT "IngestionRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRecord" ADD CONSTRAINT "IngestionRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRecord" ADD CONSTRAINT "IngestionRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IngestionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "InventoryReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "Fulfillment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_fulfillmentItemId_fkey" FOREIGN KEY ("fulfillmentItemId") REFERENCES "FulfillmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_bomComponentId_fkey" FOREIGN KEY ("bomComponentId") REFERENCES "BomComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAddress" ADD CONSTRAINT "OrderAddress_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingDecision" ADD CONSTRAINT "RoutingDecision_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingDecision" ADD CONSTRAINT "RoutingDecision_selectedFacilityId_fkey" FOREIGN KEY ("selectedFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fulfillmentId_fkey" FOREIGN KEY ("shipmentId", "fulfillmentId") REFERENCES "Shipment"("id", "fulfillmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_fulfillmentItemId_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentItemId", "fulfillmentId") REFERENCES "FulfillmentItem"("id", "fulfillmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "Fulfillment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyFulfillmentOrderLine" ADD CONSTRAINT "ShopifyFulfillmentOrderLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_id_fkey" FOREIGN KEY ("id") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSkuMapping" ADD CONSTRAINT "StoreSkuMapping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSkuMapping" ADD CONSTRAINT "StoreSkuMapping_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============ FulfillFlow invariants (hand-written; see docs/adr/ADR-07-db-constraints.md) ============
ALTER TABLE "InventoryBalance"
  ADD CONSTRAINT balance_nonneg CHECK ("onHand" >= 0 AND "reserved" >= 0),
  ADD CONSTRAINT balance_reserved_within_onhand CHECK ("reserved" <= "onHand");

ALTER TABLE "InventoryReservation"
  ADD CONSTRAINT reservation_qty CHECK ("quantity" > 0 AND "consumedQuantity" >= 0 AND "consumedQuantity" <= "quantity");

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT movement_not_noop CHECK ("onHandDelta" <> 0 OR "reservedDelta" <> 0);

ALTER TABLE "OrderItem"       ADD CONSTRAINT order_item_qty CHECK ("quantity" > 0);
ALTER TABLE "FulfillmentItem" ADD CONSTRAINT fulfillment_item_qty
  CHECK ("quantity" > 0 AND "producedQuantity" >= 0 AND "producedQuantity" <= "quantity");
ALTER TABLE "ShipmentItem"    ADD CONSTRAINT shipment_item_qty CHECK ("quantity" > 0);
ALTER TABLE "ShopifyFulfillmentOrderLine" ADD CONSTRAINT sfol_remaining_nonneg CHECK ("remainingQuantity" >= 0);

ALTER TABLE "BomComponent"
  ADD CONSTRAINT bom_component_qty CHECK ("quantityPerUnit" > 0 AND "wastageRate" >= 0 AND "wastageRate" < 1);
ALTER TABLE "PriceListItem"
  ADD CONSTRAINT price_item CHECK ("minQuantity" >= 1 AND "unitPrice" >= 0);

ALTER TABLE "ExceptionCase"
  ADD CONSTRAINT exception_has_subject
  CHECK (num_nonnulls("ingestionRecordId", "orderId", "fulfillmentId", "shipmentId") >= 1 OR "subjectKey" LIKE 'store:%');

ALTER TABLE "OutboxEvent" ADD CONSTRAINT outbox_attempts_nonneg CHECK ("attempts" >= 0);
ALTER TABLE "IngestionRecord" ADD CONSTRAINT ingestion_attempts_nonneg CHECK ("attempts" >= 0);
