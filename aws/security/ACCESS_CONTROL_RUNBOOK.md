# HospitalOS — AWS Access Control & Security Runbook

**Audience:** Team Lead / Ops (Parikshit) + 4–8 person team
**Scope:** Controlled per-person access to the EC2 server, the RDS database, and the deploy pipeline — replacing the current shared IAM user + shared `.pem`.
**Applies to the ACTUAL production:** single EC2 (t3.medium, Ubuntu 22.04, ap-south-1) running PM2 + Nginx, with RDS PostgreSQL (`database-1`). The `aws/cloudformation.yml` (ECS Fargate) is a *future* target, not what's live.

> Replace every `<ACCOUNT_ID>`, `<INSTANCE_ID>`, `<RDS_DB_RESOURCE_ID>` placeholder with your real values before running anything.

---

## 0. The problem we're fixing

Today the team shares **one IAM user** and **one `.pem` SSH key**. Consequences:

- **No accountability** — CloudTrail/audit logs show one identity; you can't tell who ran a query or restarted the server.
- **No selective revocation** — when someone leaves, you must rotate the key and redistribute it to everyone else.
- **Blast radius** — one leaked laptop = full access to a production hospital database (PHI).

The target state: **every person has their own AWS identity with MFA**, server access goes through **SSM Session Manager** (no shared key, no open port 22), database access goes through an **SSM tunnel** (RDS stays private), and CI deploys via **GitHub OIDC** (no long-lived keys). Offboarding = remove one person from one group.

---

## 1. Identity foundation — IAM Identity Center (SSO)

Set this up once. It becomes the single front door for all 4–8 people.

1. Enable **IAM Identity Center** (AWS Console → IAM Identity Center → Enable). Region: ap-south-1.
2. Create **users** (one per team member, real email) — *delete the shared IAM user once everyone is migrated*.
3. Create **groups** mapped to job function:
   - `HospitalOS-Admins` — you + senior ops. Full management of the EC2/RDS stack.
   - `HospitalOS-Developers` — SSH (via SSM) + read logs + DB read access. **No** infra-delete rights.
   - `HospitalOS-ReadOnly` — view dashboards, billing, logs. No shell, no DB write.
4. **Enforce MFA for everyone** (Identity Center → Settings → Authentication → require MFA every sign-in; allow authenticator apps / passkeys).
5. Create **permission sets** and attach the policy JSONs in `iam-policies/`:
   - Developers → `developer-ssm-access.json` + `database-access.json`
   - Admins → the above + `AdministratorAccess` (or a scoped admin set)
   - ReadOnly → AWS `ReadOnlyAccess` + billing view

**Why SSO over plain IAM users:** short-lived credentials (no static keys to leak), central MFA, one-click deactivate, and clean group-based permissions for a growing team.

---

## 2. Server access — replace SSH/.pem with SSM Session Manager

SSM gives each person a shell on the EC2 box **through the AWS API**, authenticated by their own SSO identity, fully logged, with **no inbound SSH port** required. This is the single biggest win for your "controlled access" goal.

### 2.1 One-time server prep

```bash
# SSM Agent is preinstalled on Ubuntu 22.04 AWS AMIs. Verify:
sudo snap services amazon-ssm-agent   # or: systemctl status amazon-ssm-agent

# Tag the instance so policies can scope to it:
#   Key=Project Value=HospitalOS   Key=Environment Value=production
# (EC2 Console → Instances → Tags, or via CLI)

# Attach an instance profile using iam-policies/ec2-instance-profile.json
# (EC2 → Actions → Security → Modify IAM role)
```

### 2.2 Install Session Manager plugin (each person, once, on their laptop)

```bash
# macOS
brew install --cask session-manager-plugin
# then they authenticate with SSO:
aws configure sso        # one-time, uses the Identity Center start URL
```

### 2.3 Daily use (replaces `ssh -i Avani His.pem ...`)

```bash
aws ssm start-session --target <INSTANCE_ID> --region ap-south-1
# drops you onto the box as ssm-user; sudo to ubuntu if needed
```

### 2.4 Turn on session logging (audit trail)

Session Manager → Preferences → enable logging to **CloudWatch Logs** (`/hospitalos/ssm-sessions`) and/or an S3 bucket. Now every command every person runs is recorded — this is your accountability layer and helps with DPDP/audit obligations.

### 2.5 Close the door behind you

Once SSM works for everyone:

- **Remove the port 22 inbound rule** from the EC2 security group (or, transitional: restrict to your office/VPN IP only).
- **Delete the shared `Avani His.pem`** from everyone's machines and revoke it. Nobody needs it anymore.

---

## 3. Database access — keep RDS private, tunnel per-person

**Rule #1: RDS must not be publicly accessible.** Set `Publicly Accessible = No`, and its security group accepts 5432 **only from the EC2 security group** (not `0.0.0.0/0`). Developers reach it by tunnelling *through* the EC2 box over SSM.

### 3.1 Per-person tunnel (no shared key, no public RDS)

```bash
# Forward local 5432 -> RDS:5432 through the EC2 instance, over SSM:
aws ssm start-session \
  --target <INSTANCE_ID> \
  --region ap-south-1 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["database-1.cfmygyosw8fp.ap-south-1.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["5432"]}'

# In another terminal, connect Prisma Studio / psql to localhost:5432
psql -h localhost -U dev_readonly -d database-1
```

### 3.2 Stop sharing the DB master password — two options

**Option A (recommended): RDS IAM database authentication.** Enable it on the RDS instance, then each person connects using a short-lived token tied to their AWS identity (`database-access.json` grants `rds-db:connect`). No shared password exists. Map each person to a Postgres role suffixed `_iam`.

**Option B (simpler): least-privilege Postgres roles.** Create scoped roles so most people physically cannot write to patient tables:

```sql
-- Read-only role for developers/debugging
CREATE ROLE dev_readonly LOGIN PASSWORD '<unique-per-person>';
GRANT CONNECT ON DATABASE "database-1" TO dev_readonly;
GRANT USAGE ON SCHEMA public TO dev_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dev_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO dev_readonly;

-- The application keeps its own dedicated read/write user (NOT the master user)
-- Never let the app run as the RDS master/superuser.
```

The **RDS master password** (`Avani112`) should be known to *no human in daily use* — store it in Secrets Manager, used only for break-glass admin.

---

## 4. Deploy / CI pipeline — GitHub OIDC, no stored keys

Do **not** put AWS access keys in GitHub secrets. Use **OIDC**: GitHub Actions proves its identity to AWS and assumes a scoped role at runtime.

1. Add GitHub as an **OIDC identity provider** in IAM (`token.actions.githubusercontent.com`).
2. Create role `HospitalOS-CI-Deploy` with trust policy `iam-policies/ci-deploy-role-trust.json` (locked to `repo:Parikshit127/hospital-managment-system:ref:refs/heads/main`) and permissions `iam-policies/ci-deploy-permissions.json`.
3. The workflow assumes the role, then triggers deployment via **SSM Run Command** on the tagged instance — so even CI never needs SSH:

```yaml
# .github/workflows/deploy.yml (sketch)
permissions:
  id-token: write
  contents: read
steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::<ACCOUNT_ID>:role/HospitalOS-CI-Deploy
      aws-region: ap-south-1
  - run: |
      aws ssm send-command \
        --document-name AWS-RunShellScript \
        --targets "Key=tag:Project,Values=HospitalOS" \
        --parameters 'commands=["cd /home/ubuntu/hospitalos && git pull origin main && npm ci && npx prisma migrate deploy && npm run build && pm2 reload hospitalos"]'
```

**Who can deploy:** only `main` can assume the role (branch condition), and only Admins/leads should be able to merge to `main` (GitHub branch protection + required review). Humans deploy by merging a PR, not by SSHing in.

---

## 5. Onboarding a new team member (checklist)

```
[ ] Create their user in IAM Identity Center (real email)
[ ] Add to the correct group (Developers / Admins / ReadOnly)
[ ] Confirm they enrolled MFA on first login
[ ] They run: aws configure sso  +  install session-manager-plugin
[ ] Verify: aws ssm start-session --target <INSTANCE_ID>  (works)
[ ] Create their personal DB role (dev_readonly or IAM-auth user) — NO shared password
[ ] Share this runbook; do NOT share any .pem or master password
```

## 6. Offboarding (checklist) — must be same-day

```
[ ] Disable/remove user in IAM Identity Center  (kills SSM + console + DB-IAM access instantly)
[ ] Drop their Postgres role:  DROP ROLE <their_role>;
[ ] Rotate any shared secret they could have seen (JWT_SECRET, RDS master pw, Razorpay keys)
[ ] Review CloudTrail + SSM session logs for their recent activity
[ ] Remove their GitHub repo access
```

---

## 7. Immediate "stop the bleeding" — do these first, in order

| # | Action | Why | Where |
|---|--------|-----|-------|
| 1 | Lock RDS SG to EC2-SG only; `Publicly Accessible = No` | Patient DB currently reachable from the internet | RDS Console |
| 2 | Enable MFA on the AWS **root** account; stop using root daily | Root = total account takeover if phished | IAM |
| 3 | Stand up IAM Identity Center + per-person users | Ends shared-credential blind spot | §1 |
| 4 | Enable SSM access + session logging; remove port 22; revoke shared `.pem` | Auditable, per-person server access | §2 |
| 5 | Turn on CloudTrail (all regions) + GuardDuty + a billing alarm | Detection & cost-runaway protection | §0 of security plan |
| 6 | Enable RDS automated backups (7-day) + deletion protection + storage encryption | Don't lose / leak the irreplaceable data | RDS Console |
| 7 | Move `.env` secrets to SSM Parameter Store / Secrets Manager | One plaintext file ≠ acceptable for PHI app | §3.2 |

---

## 8. What I (Claude) cannot do from here

I have **no access to your live AWS account** and cannot SSH to the EC2 box, so I cannot verify current security-group rules, enable Identity Center, or run these commands for you. This runbook + the `iam-policies/*.json` files are designed to be executed by you (or via the desktop/SSH) with your real account values filled in. If you grant me browser access to the AWS Console, I can walk through specific screens with you interactively.
