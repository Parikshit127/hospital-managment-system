# HospitalOS — Azure Test Clone Guide

This clones the current AWS production setup (Ubuntu VM + PM2 + nginx, see
`aws/ec2-setup.sh` / `aws/deploy-ec2.sh`) onto Azure, with its own copy of the
database and files, so you can test there without touching AWS production.

## Architecture (test clone)

```
Internet → nginx (VM) → PM2 cluster (Next.js) → Azure Postgres Flexible Server
                                               → Azure Blob Storage (documents)
```

AWS keeps running exactly as-is in parallel — nothing here touches it, except
that step 3 reads (never writes) from the production database and S3 bucket
to seed the clone.

## Prerequisites

1. An Azure subscription (with a payment method — this provisions billable resources)
2. `az` CLI — not installed yet, see Step 0
3. `azcopy` — for the S3 → Blob file copy, see Step 3
4. Your AWS prod `.env` values on hand (for `SOURCE_DIRECT_URL`, S3 creds) — do not commit these anywhere

## Step 0: Install and log in to Azure CLI

```bash
# macOS
brew update && brew install azure-cli

# Log in — opens a browser window
az login

# Verify
az account show
```

If you have more than one subscription, pick the right one:
```bash
az account list --output table
az account set --subscription "<subscription-id-or-name>"
```

## Step 1: Provision Azure resources

Edit the variables at the top of `azure/provision.sh` (region, names, sizes),
then:

```bash
chmod +x azure/provision.sh
./azure/provision.sh
```

This creates: a resource group, an Ubuntu 22.04 VM (ports 22/80/443 open), a
Postgres Flexible Server + database, and a Storage Account + Blob container.
It prints all the connection strings you need at the end — save them.

## Step 2: Set up the VM

```bash
ssh <your-vm-admin-username>@<VM_IP>
# copy azure/vm-setup.sh to the VM, or paste its contents, then:
sudo ./vm-setup.sh
```

`vm-setup.sh` auto-detects whatever username you SSH'd in as (via `sudo`) —
it doesn't assume `azureuser`, so this works with whatever admin username you
picked when creating the VM.

This installs Node 22, PM2, nginx, the Postgres client, Azure CLI, and a
firewall — mirroring `aws/ec2-setup.sh`.

## Step 3: Copy prod data into the clone

Run from your laptop (needs network access to both the source and target DBs):

```bash
export SOURCE_DIRECT_URL="<prod Supabase DIRECT_URL from your AWS .env>"
export TARGET_DIRECT_URL="<Azure Postgres DIRECT_URL from provision.sh output>"

# Only needed if you also want files copied (S3 → Blob):
export SOURCE_AWS_ACCESS_KEY_ID="<prod AWS key>"
export SOURCE_AWS_SECRET_ACCESS_KEY="<prod AWS secret>"
export SOURCE_S3_BUCKET="<prod AWS_S3_BUCKET>"
export TARGET_AZURE_STORAGE_ACCOUNT="<from provision.sh output>"
export TARGET_AZURE_STORAGE_CONTAINER="patient-records"
export TARGET_AZURE_SAS_TOKEN="?sv=...&sig=...(a write+list SAS, see below)"

chmod +x azure/migrate-data.sh
./azure/migrate-data.sh
```

To generate the SAS token for the target container:
```bash
az storage container generate-sas \
  --account-name <TARGET_AZURE_STORAGE_ACCOUNT> \
  --name patient-records \
  --permissions rwl \
  --expiry $(date -u -d "+1 day" '+%Y-%m-%dT%H:%MZ') \
  --output tsv
```

This is real patient data — treat the temporary `/tmp/hospitalos-migration-*.dump`
file and these credentials accordingly; delete the dump file once restored.

## Step 4: Deploy the app onto the VM

```bash
ssh <your-vm-admin-username>@<VM_IP>
git clone https://github.com/Parikshit127/hospital-managment-system.git hospitalos
cd hospitalos
cp azure/.env.azure.example .env
nano .env   # fill in DATABASE_URL, DIRECT_URL, AZURE_STORAGE_*, plus SMTP/Razorpay/etc from your AWS .env

chmod +x azure/deploy-vm.sh
./azure/deploy-vm.sh
```

## Step 5: nginx + HTTPS (optional, if using a real test domain)

```bash
sudo cp azure/nginx.conf /etc/nginx/sites-available/hospitalos-test
sudo ln -s /etc/nginx/sites-available/hospitalos-test /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d hims-test.yourhospital.com
```

Without a domain, you can just hit `http://<VM_IP>:3000` directly for testing.

## Step 6: Lock down the database firewall

Step 1 opens the Postgres server to all IPs so the migration in Step 3 can
reach it from your laptop. Once migration is done, tighten it to the VM only:

```bash
az postgres flexible-server firewall-rule delete \
  --resource-group hospitalos-test-rg --name <DB_SERVER_NAME> --rule-name AllowAll

az postgres flexible-server firewall-rule create \
  --resource-group hospitalos-test-rg --name <DB_SERVER_NAME> \
  --rule-name AllowVM --start-ip-address <VM_IP> --end-ip-address <VM_IP>
```

## Verifying it worked

- `curl http://<VM_IP>:3000/api/health` (or your test domain)
- Log in and confirm patient records / data match production
- Upload a test file and confirm it lands in the `patient-records` Blob container, not S3
- `pm2 logs hospitalos` on the VM for runtime errors

## Cleaning up

When you're done testing, tear down the resource group in one shot — this
deletes the VM, DB, and storage account together, and does not touch AWS:

```bash
az group delete --name hospitalos-test-rg --yes --no-wait
```

## What did NOT change

- AWS EC2/production keeps running on S3 (`STORAGE_PROVIDER` defaults to `s3`
  when unset — see `app/lib/s3.ts`)
- No changes to `aws/`, `Dockerfile`, `docker-compose.yml`, or prod `.env`
- The only code change made for this: `app/lib/s3.ts` now dispatches to
  `app/lib/blob-azure.ts` when `STORAGE_PROVIDER=azure-blob`; the Azure SDK is
  dynamically imported so it's never loaded/bundled for the AWS deployment.
