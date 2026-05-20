# HospitalOS AWS Deployment Guide

## Architecture

```
Internet → ALB (HTTPS) → ECS Fargate (2 containers) → RDS PostgreSQL (Multi-AZ)
                                                     → S3 (Documents)
                                                     → S3 (Backups)
```

- **Region:** ap-south-1 (Mumbai)
- **Compute:** ECS Fargate (0.5 vCPU, 1 GB per container, 2 containers)
- **Database:** RDS PostgreSQL 16 (db.t3.small, Multi-AZ, encrypted, 14-day backups)
- **Storage:** S3 with versioning + encryption + lifecycle to Glacier after 90 days
- **Networking:** VPC with public subnets (ALB) and private subnets (ECS + RDS)
- **Secrets:** AWS Secrets Manager (not env files)
- **Logs:** CloudWatch with 30-day retention
- **Auto-scaling:** 2-4 containers based on CPU (target 70%)

## Prerequisites

1. AWS CLI installed and configured
2. Docker installed locally
3. A registered domain name
4. AWS account with admin access

## Estimated Monthly Cost

| Service          | Config              | Cost/month |
|------------------|---------------------|------------|
| ECS Fargate      | 2 tasks, 0.5vCPU    | ~$30       |
| RDS PostgreSQL   | db.t3.small, Multi-AZ| ~$50      |
| ALB              | 1 load balancer     | ~$20       |
| S3               | 50 GB estimated     | ~$2        |
| NAT Gateway      | 1 gateway           | ~$35       |
| CloudWatch       | Logs + metrics      | ~$5        |
| Secrets Manager  | 1 secret            | ~$1        |
| **Total**        |                     | **~$143**  |

## Step-by-Step Setup

### Step 1: Create an SSL Certificate

```bash
# Request a certificate in ACM (must be in ap-south-1)
aws acm request-certificate \
  --domain-name hims.yourhospital.com \
  --validation-method DNS \
  --region ap-south-1

# Note the CertificateArn from the output
# Add the CNAME record to your DNS for validation
# Wait for validation (check status):
aws acm describe-certificate --certificate-arn <ARN> --query Certificate.Status
```

### Step 2: Deploy CloudFormation Stack

```bash
# Generate a strong database password
DB_PASS=$(openssl rand -base64 24)
echo "Save this password securely: $DB_PASS"

# Deploy the infrastructure
aws cloudformation create-stack \
  --stack-name hospitalos-production \
  --template-body file://aws/cloudformation.yml \
  --capabilities CAPABILITY_IAM \
  --region ap-south-1 \
  --parameters \
    ParameterKey=Environment,ParameterValue=production \
    ParameterKey=AppDomain,ParameterValue=hims.yourhospital.com \
    ParameterKey=DBPassword,ParameterValue="$DB_PASS" \
    ParameterKey=CertificateArn,ParameterValue=<your-cert-arn>

# Wait for stack creation (~15-20 minutes)
aws cloudformation wait stack-create-complete --stack-name hospitalos-production

# Get the outputs
aws cloudformation describe-stacks \
  --stack-name hospitalos-production \
  --query "Stacks[0].Outputs" \
  --output table
```

### Step 3: Update Secrets Manager

```bash
# Get the RDS endpoint from CloudFormation outputs
RDS_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name hospitalos-production \
  --query "Stacks[0].Outputs[?OutputKey=='DatabaseEndpoint'].OutputValue" \
  --output text)

# Build the DATABASE_URL
DATABASE_URL="postgresql://hospitalos_admin:${DB_PASS}@${RDS_ENDPOINT}:5432/hospitalos"

# Update all secrets
aws secretsmanager update-secret \
  --secret-id hospitalos/production/app \
  --secret-string '{
    "DATABASE_URL": "'$DATABASE_URL'",
    "DIRECT_URL": "'$DATABASE_URL'",
    "JWT_SECRET": "'$(openssl rand -base64 64)'",
    "RAZORPAY_KEY_ID": "rzp_live_XXXX",
    "RAZORPAY_KEY_SECRET": "your-live-key",
    "OPENAI_API_KEY": "sk-...",
    "SMTP_PASS": "your-smtp-password",
    "AISENSY_API_KEY": "your-aisensy-key",
    "SMTP_HOST": "smtp.gmail.com",
    "SMTP_PORT": "587",
    "SMTP_USER": "noreply@yourhospital.com"
  }'
```

### Step 4: Build and Push Docker Image

```bash
# Get ECR URI
ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name hospitalos-production \
  --query "Stacks[0].Outputs[?OutputKey=='ECRRepositoryUri'].OutputValue" \
  --output text)

# Login to ECR
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin $ECR_URI

# Build the Docker image
docker build -t hospitalos .

# Tag and push
docker tag hospitalos:latest $ECR_URI:latest
docker push $ECR_URI:latest
```

### Step 5: Run Database Migrations

```bash
# Run a one-time ECS task for migrations
aws ecs run-task \
  --cluster hospitalos-production \
  --task-definition hospitalos-production \
  --launch-type FARGATE \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["<private-subnet-a>", "<private-subnet-b>"],
      "securityGroups": ["<app-security-group>"]
    }
  }' \
  --overrides '{
    "containerOverrides": [{
      "name": "hospitalos",
      "command": ["npx", "prisma", "migrate", "deploy"]
    }]
  }'
```

### Step 6: Point Your Domain

```bash
# Get ALB DNS name
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name hospitalos-production \
  --query "Stacks[0].Outputs[?OutputKey=='ALBDNSName'].OutputValue" \
  --output text)

echo "Add this CNAME record to your DNS:"
echo "  hims.yourhospital.com → $ALB_DNS"
```

### Step 7: Configure GitHub Actions

Add these secrets to your GitHub repo (Settings → Secrets → Actions):

- `AWS_ACCESS_KEY_ID` — IAM user with ECR + ECS deploy permissions
- `AWS_SECRET_ACCESS_KEY` — corresponding secret key

After this, every push to `main` will auto-deploy.

### Step 8: Verify

```bash
# Check ECS service status
aws ecs describe-services \
  --cluster hospitalos-production \
  --services hospitalos-production \
  --query "services[0].{status:status,running:runningCount,desired:desiredCount}"

# Check health endpoint
curl https://hims.yourhospital.com/api/health
```

## Post-Deployment

### Database Backups (Automated)

RDS handles daily automated backups with 14-day retention. For additional pg_dump backups to S3:

```bash
# Add to a cron job or Lambda function
pg_dump "$DATABASE_URL" --format=custom --no-owner | \
  aws s3 cp - s3://hospitalos-production-backups/db/$(date +%Y%m%d).dump
```

### Monitoring

- **CloudWatch:** Container logs at `/ecs/hospitalos-production`
- **RDS Performance Insights:** Enabled by default in the stack
- **Health checks:** ALB checks `/api/health` every 30 seconds

### Scaling

Edit `DesiredCount` in CloudFormation or:
```bash
aws ecs update-service \
  --cluster hospitalos-production \
  --service hospitalos-production \
  --desired-count 3
```

### Rolling Back

```bash
# ECS keeps previous task definitions. To rollback:
aws ecs update-service \
  --cluster hospitalos-production \
  --service hospitalos-production \
  --task-definition hospitalos-production:<previous-revision>
```
