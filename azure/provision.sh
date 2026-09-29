#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HospitalOS — Azure Provisioning Script
# Creates a test-clone environment: Resource Group, Ubuntu VM, Postgres Flexible
# Server, and a Storage Account with a blob container.
# Mirrors what aws/cloudformation.yml + ec2-setup.sh do on AWS.
#
# Prerequisites: az CLI installed and `az login` already run.
#   Install:  https://learn.microsoft.com/cli/azure/install-azure-cli
#
# Usage: edit the variables below, then: chmod +x provision.sh && ./provision.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Variables — edit before running ─────────────────────────────────────────
RESOURCE_GROUP="hospitalos-test-rg"
LOCATION="centralindia"                 # closest Azure region to ap-south-1
VM_NAME="hospitalos-test-vm"
VM_SIZE="Standard_B2s"                  # 2 vCPU / 4GB — comparable to a small EC2
VM_ADMIN_USER="azureuser"
VM_IMAGE="Ubuntu2204"

DB_SERVER_NAME="hospitalos-test-db-$RANDOM"   # must be globally unique
DB_ADMIN_USER="hospitalosadmin"
DB_ADMIN_PASSWORD="CHANGE_ME_$(openssl rand -hex 8)"
DB_NAME="hospitalos"
DB_SKU="Standard_B1ms"                  # burstable, comparable to small dev DB
DB_VERSION="16"                         # matches postgres:16-alpine in docker-compose.yml

STORAGE_ACCOUNT="hospitalostest$RANDOM" # must be globally unique, lowercase, no dashes
STORAGE_CONTAINER="patient-records"

echo "╔══════════════════════════════════════════════════════╗"
echo "║     HospitalOS — Azure Test Clone Provisioning       ║"
echo "╚══════════════════════════════════════════════════════╝"

# ── 1. Resource Group ────────────────────────────────────────────────────────
echo ""
echo "► Step 1/5: Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output table

# ── 2. Ubuntu VM (mirrors the EC2 instance) ─────────────────────────────────
echo ""
echo "► Step 2/5: Creating VM..."
az vm create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VM_NAME" \
    --image "$VM_IMAGE" \
    --size "$VM_SIZE" \
    --admin-username "$VM_ADMIN_USER" \
    --generate-ssh-keys \
    --public-ip-sku Standard \
    --output table

echo "► Opening ports 80 and 443..."
az vm open-port --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --port 80 --priority 1010
az vm open-port --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --port 443 --priority 1020

VM_IP=$(az vm show -d --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --query publicIps -o tsv)
echo "   VM public IP: $VM_IP"

# ── 3. Postgres Flexible Server (test-clone DB) ─────────────────────────────
echo ""
echo "► Step 3/5: Creating Postgres Flexible Server..."
az postgres flexible-server create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DB_SERVER_NAME" \
    --location "$LOCATION" \
    --admin-user "$DB_ADMIN_USER" \
    --admin-password "$DB_ADMIN_PASSWORD" \
    --sku-name "$DB_SKU" \
    --tier Burstable \
    --version "$DB_VERSION" \
    --storage-size 32 \
    --public-access 0.0.0.0-255.255.255.255 \
    --output table
# NOTE: --public-access here is wide-open for the initial pg_dump/restore step.
# After migrate-data.sh finishes, tighten this to the VM's IP only:
#   az postgres flexible-server firewall-rule delete --resource-group "$RESOURCE_GROUP" --name "$DB_SERVER_NAME" --rule-name AllowAll
#   az postgres flexible-server firewall-rule create --resource-group "$RESOURCE_GROUP" --name "$DB_SERVER_NAME" --rule-name AllowVM --start-ip-address "$VM_IP" --end-ip-address "$VM_IP"

echo "► Creating database..."
az postgres flexible-server db create \
    --resource-group "$RESOURCE_GROUP" \
    --server-name "$DB_SERVER_NAME" \
    --database-name "$DB_NAME" \
    --output table

# ── 4. Storage Account + Blob container (replaces S3) ───────────────────────
echo ""
echo "► Step 4/5: Creating storage account + container..."
az storage account create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$STORAGE_ACCOUNT" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --min-tls-version TLS1_2 \
    --output table

STORAGE_KEY=$(az storage account keys list --resource-group "$RESOURCE_GROUP" --account-name "$STORAGE_ACCOUNT" --query "[0].value" -o tsv)

az storage container create \
    --account-name "$STORAGE_ACCOUNT" \
    --account-key "$STORAGE_KEY" \
    --name "$STORAGE_CONTAINER" \
    --public-access off \
    --output table

CONNECTION_STRING=$(az storage account show-connection-string --resource-group "$RESOURCE_GROUP" --name "$STORAGE_ACCOUNT" -o tsv)

# ── 5. Summary ────────────────────────────────────────────────────────────
echo ""
echo "► Step 5/5: Done. Save these values into azure/.env (see .env.azure.example):"
echo ""
echo "  VM public IP:                 $VM_IP"
echo "  SSH:                          ssh $VM_ADMIN_USER@$VM_IP"
echo ""
echo "  DATABASE_URL / DIRECT_URL host: $DB_SERVER_NAME.postgres.database.azure.com"
echo "  DB admin user:                 $DB_ADMIN_USER"
echo "  DB admin password:             $DB_ADMIN_PASSWORD"
echo "  DB name:                       $DB_NAME"
echo "  DATABASE_URL=\"postgresql://$DB_ADMIN_USER:$DB_ADMIN_PASSWORD@$DB_SERVER_NAME.postgres.database.azure.com:5432/$DB_NAME?sslmode=require\""
echo "  DIRECT_URL=\"postgresql://$DB_ADMIN_USER:$DB_ADMIN_PASSWORD@$DB_SERVER_NAME.postgres.database.azure.com:5432/$DB_NAME?sslmode=require\""
echo ""
echo "  STORAGE_PROVIDER=azure-blob"
echo "  AZURE_STORAGE_CONNECTION_STRING=\"$CONNECTION_STRING\""
echo "  AZURE_STORAGE_CONTAINER=\"$STORAGE_CONTAINER\""
echo ""
echo "  Next: run ./migrate-data.sh to copy prod DB + files into these,"
echo "  then vm-setup.sh + deploy-vm.sh to deploy the app onto $VM_IP."
