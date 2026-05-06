# Cloud & Infrastructure Security Reference

Use this for AWS, Azure, GCP, Kubernetes, Terraform, and infrastructure-as-code review. The mental model: cloud security is identity, network, and data — in that order. Misconfigured IAM is the dominant breach vector. Network controls are the second wall. Data protection is what you fall back on when the first two fail.

## The first questions on any cloud target

1. **Identity model.** Who/what can authenticate, and as what? Human users via SSO? Service accounts? Workload identity (IRSA / GCP Workload Identity / Azure Managed Identity)? Long-lived access keys (smell)?
2. **Trust boundaries.** Account/subscription/project boundaries are the strongest. VPC/VNet boundaries are next. Within a VPC, security groups / NSGs. Within a cluster, network policies and namespaces.
3. **Privilege escalation paths.** From any compromised principal, what's the path to admin? `iam:PassRole` to a more-privileged role. `lambda:UpdateFunctionCode` on a function with a powerful role. `cloudformation:*` with a privileged service role. AssumeRole chains.
4. **Data crown jewels.** Where's the data the attacker actually wants? S3 buckets with PII, RDS instances, secrets in Secrets Manager / KMS / Parameter Store, source code in CodeCommit, container images in ECR.

## AWS — the high-impact patterns

### IAM — where the bodies are buried

**Wildcards in trust policies.** A role that trusts `arn:aws:iam::*:root` (or `Principal: "*"`) without a `sts:ExternalId` condition is a confused-deputy time bomb if anyone gets your account ID. Even within an account, overly permissive trust policies are how lateral movement happens.

**`iam:PassRole` is a privilege escalation primitive.** A user with `lambda:CreateFunction` + `iam:PassRole` for an admin role can create a Lambda that assumes the admin role and runs arbitrary code. Same shape with `ec2:RunInstances`, `ecs:RegisterTaskDefinition`, CodeBuild, Glue, Step Functions, etc. Audit `iam:PassRole` permissions tightly — the resource constraint matters.

**Privilege escalation patterns to look for in any IAM audit:**
- `iam:CreatePolicy` / `iam:CreatePolicyVersion` / `iam:SetDefaultPolicyVersion`
- `iam:AttachUserPolicy` / `iam:AttachRolePolicy` / `iam:AttachGroupPolicy`
- `iam:PutUserPolicy` / `iam:PutRolePolicy` / `iam:PutGroupPolicy` (inline)
- `iam:UpdateAssumeRolePolicy` (rewrite the trust policy of a target role)
- `iam:PassRole` + any compute (`lambda:*`, `ec2:RunInstances`, `ecs:*`, `glue:*`, `sagemaker:*`)
- `iam:CreateAccessKey` on another user
- `sts:AssumeRole` with a misconfigured target trust policy

The combinations are what matters — individual permissions can look benign and chain into admin.

**Resource-based policies and S3.** S3 bucket policies, KMS key policies, Secrets Manager resource policies. A bucket policy granting `Principal: "*"` is the headline-grade misconfig. More common and equally bad: bucket policy granting another account access without `aws:SourceArn` or `aws:SourceAccount` constraints.

### IMDS — the SSRF amplifier

EC2 instance metadata service. IMDSv1 is unauthenticated; any SSRF on the instance reads role credentials. **IMDSv2 is mandatory** — it requires a session token via `PUT`, which most SSRF chains can't produce. Audit:
- `MetadataOptions.HttpTokens = required` (IMDSv2 only)
- `MetadataOptions.HttpPutResponseHopLimit = 1` (prevents container escape via IMDS)
- `MetadataOptions.HttpEndpoint = enabled` is fine; `disabled` is fine for instances that don't need it

If you find an SSRF in an EC2-hosted app and IMDSv1 is enabled, the finding is almost always critical — instance role credentials → whatever that role can do, often a lot.

### S3

The classics:
- Public bucket via ACL or policy (Block Public Access at account level mitigates)
- Public bucket via signed URLs that don't expire (or expire too far in the future)
- Cross-account access without source constraints
- Logging buckets in the same account they're logging (an attacker who compromises the account can rewrite their own audit trail)
- Versioning + MFA-delete for sensitive buckets is a defense against ransomware
- Server-side encryption is table stakes, but the *key policy* on a customer-managed KMS key is what matters

### VPC and networking

- Security groups with `0.0.0.0/0` on non-public ports (SSH, RDP, database ports, internal admin ports)
- Default VPC still in use (it's permissive by default)
- Peering connections to less-trusted VPCs without route-table restrictions
- VPC endpoints missing for sensitive services (forces traffic through the internet)
- NACLs as a backup control — usually misconfigured to be either trivially permissive or accidentally blocking legitimate traffic

### Logging and detection

- CloudTrail multi-region, log file validation enabled, logs in a separate account
- Config rules for drift detection
- GuardDuty enabled in all regions (cheap, catches the obvious)
- Lack of any of these is a finding, but call it Medium not Critical unless paired with other issues

## Azure

**RBAC vs. Azure AD roles.** Two separate systems often confused. Azure AD roles control identity-plane operations (user management, app registrations). Azure RBAC controls resource-plane operations (VMs, storage, etc.). Privilege escalation often crosses the two — e.g., Application Administrator role can add credentials to an enterprise app that has high RBAC privileges.

**Specific patterns to audit:**
- Service principals with secret credentials (vs. workload identity / managed identities)
- Owner role on subscriptions or management groups granted broadly
- Key Vault access policies (legacy) vs. RBAC mode — and policies granting `get` on secrets to unexpected principals
- Storage accounts with anonymous blob access enabled
- NSGs with Internet → 22/3389 inbound rules
- Conditional Access policies that don't actually cover the access path you're worried about (CA gaps are a major real-world issue)
- Managed identity assigned to a VM/Function with permissions beyond what the workload needs

**AAD attack surfaces:** application consent grants, OAuth phishing, refresh token theft, primary refresh token (PRT) extraction in joined-device scenarios, AD Connect sync account compromise.

## GCP

**Project hierarchy.** Org → Folder → Project. IAM bindings inherit downward. A binding at the org level is rarely correct unless you really mean it.

**Specific patterns:**
- Default service accounts (Compute Engine default, App Engine default) with `Editor` role (still common in older projects, often broadly powerful)
- Service account key creation enabled (prefer workload identity + short-lived tokens)
- `iam.serviceAccounts.actAs` is the GCP equivalent of `iam:PassRole`
- Cloud Storage buckets with `allUsers` or `allAuthenticatedUsers` IAM bindings
- VPC firewall rules with source `0.0.0.0/0`
- GKE clusters with Workload Identity disabled (forces use of node service account, which usually has more permissions than any pod needs)
- Cloud Functions / Cloud Run with `allUsers` invoker

**Privilege escalation primitives:** `iam.serviceAccounts.getAccessToken` on a more-privileged SA, `iam.serviceAccounts.implicitDelegation`, `iam.serviceAccountKeys.create`, deployment-related permissions on resources running as privileged SAs.

## Kubernetes

The K8s threat model is layered: cluster admin → namespace admin → pod compromise → node compromise → cluster compromise. Audit each layer.

### RBAC

- ClusterRoles with `*` verbs or `*` resources
- Bindings to `system:authenticated` or `system:unauthenticated` (the latter is anonymous)
- ServiceAccounts with token auto-mount enabled when not needed
- Default ServiceAccount in each namespace bound to roles (it shouldn't be — workloads should use named SAs)
- Verbs that allow privilege escalation: `escalate` and `bind` on roles, `impersonate` on users/groups/SAs, `create`/`update` on rolebindings

### Pod security

- Pods running as root (`runAsUser: 0` or unset)
- `privileged: true` containers (full host access)
- `hostNetwork: true`, `hostPID: true`, `hostIPC: true` (host-namespace escapes)
- hostPath volumes mounting sensitive paths (`/`, `/var/run/docker.sock`, `/etc`, `/proc`)
- Capabilities not dropped (`SYS_ADMIN`, `NET_ADMIN`, `SYS_PTRACE` are particularly dangerous)
- `allowPrivilegeEscalation: true` (default if unset)
- Pod Security Standards: enforce `restricted` profile by default, `baseline` if `restricted` is too tight, `privileged` only with documented exceptions

### Network

- NetworkPolicies absent (default-allow between all pods in cluster)
- Ingress controllers exposing internal services without auth
- API server accessible from non-control-plane networks
- etcd accessible without mTLS or with weak certs
- Service mesh deployed but mTLS not enforced (PERMISSIVE mode in Istio)

### Supply chain

- Images from untrusted registries
- `imagePullPolicy: Always` not set on `:latest` tags (you can pin a tag and have it shadowed)
- No image signing / admission controller verifying signatures
- Helm charts with hardcoded secrets or `imagePullSecrets` referencing unrotated creds
- CI/CD with cluster-admin kubeconfigs (the CI is now your most privileged identity)

## Terraform / IaC review

When reviewing IaC, the bugs are usually one of:

**Resource misconfigurations.** Same patterns as runtime audits — `aws_security_group_rule` with `cidr_blocks = ["0.0.0.0/0"]`, `aws_s3_bucket` with `acl = "public-read"`, `aws_db_instance` with `publicly_accessible = true`, `google_storage_bucket_iam_member` granting `allUsers`.

**Dangerous interpolations.** Secret values in plaintext, computed strings that build shell commands in `local-exec` provisioners, dynamic resource attributes that reference user input through pipelines.

**State file exposure.** Terraform state contains secrets in plaintext. State in a public-accessible bucket is a real-world compromise vector. Backend config should use a private bucket with versioning, encryption, locking via DynamoDB, and tight IAM.

**Module sources.** Modules pulled from public registries pinned to mutable refs (no version, no commit SHA) are a supply chain risk.

**Provider credentials.** Hardcoded credentials in `.tf` files. Service account keys committed to repos.

Tools like `tfsec`, `checkov`, `terrascan`, `kics` catch a lot of this — but their output, like SAST, needs reachability triage. A flagged S3 bucket without encryption matters less if it's used for non-sensitive public assets.

## Secrets management

The pattern is consistent across clouds: secrets in code, secrets in env vars on long-running infrastructure, secrets in CI logs, secrets in container images, secrets in Terraform state. Find them with `gitleaks`, `trufflehog`, `detect-secrets`. The remediation is rotation + moving to a secrets manager + audit logs on access.

The harder version: secrets that are *correctly* in a secrets manager but with overly permissive access policies, or with no rotation policy, or with the rotation policy disabled.

## What good output looks like

For cloud findings, the format from SKILL.md applies. Specific to this domain:

- **Location** is the resource ARN/ID + the specific config field, plus the file/line if reviewing IaC.
- **Reachability** should explain who can hit this — cross-account, internet-exposed, in-VPC-only, requires-existing-foothold.
- **Exploit sketch** should chain to impact: "compromise of the web tier → SSRF → IMDSv1 credentials → role allows `s3:*` on `cust-data-prod` → full PII exfil."
- **Fix** should reference the specific config change (the IAM condition to add, the security group rule to remove, the IMDS option to set).

Cloud findings often chain — list the chain explicitly. The individual misconfigs may each be "Medium" but the chain is "Critical."
