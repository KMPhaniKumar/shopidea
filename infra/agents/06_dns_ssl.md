# Phase 5 — DNS + SSL

> Get `https://api-dev.reelmart.in` resolving and certified, pointing at the ALB.

## Goal
- Route 53 hosted zone for `reelmart.in` exists (import if it already does)
- ACM certificate covering `api-dev.reelmart.in` (wildcard `*.reelmart.in` recommended)
- ACM cert attached to ALB HTTPS listener
- `api-dev.reelmart.in` → ALB (alias A record)

## Prerequisites
- Phase 1 (ALB exists with HTTPS listener using a placeholder fixed-response default action)
- Phase 4 (services answering on `/api/<svc>/health`)
- Domain `reelmart.in` registered (anywhere — registrar doesn't have to be Route 53)

## Inputs
- `DOMAIN_NAME = reelmart.in`
- `DEV_API_SUBDOMAIN = api-dev.reelmart.in`

## Layer
This phase writes to `infra/dev/dns.tfstate`.

## Module used
`modules/network/` (Route 53 zone) + cert/listener resources directly in `environments/dev/dns.tf`.

## Steps

### 5.1 — Hosted zone (one-time, shared between dev and prod)
If you haven't yet:
```hcl
# environments/shared/hosted-zone.tf  (one-time bootstrap, separate state)
resource "aws_route53_zone" "primary" {
  name = "reelmart.in"
  tags = { Project = "reelmart" }
}
```

After apply, take the **4 NS records** from the zone and update them at your domain registrar (GoDaddy / Namecheap / wherever you bought reelmart.in). Propagation: 5 min – 48 hr.

```bash
aws route53 list-resource-record-sets --hosted-zone-id $(aws route53 list-hosted-zones-by-name \
  --dns-name reelmart.in --query 'HostedZones[0].Id' --output text | sed 's|/hostedzone/||') \
  --query 'ResourceRecordSets[?Type==`NS`].ResourceRecords[].Value' --output text
```

### 5.2 — Certificate (ACM, DNS-validated)
```hcl
# environments/dev/dns.tf
resource "aws_acm_certificate" "api" {
  domain_name               = "*.reelmart.in"
  subject_alternative_names = ["reelmart.in"]
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
}

# Auto-create the validation CNAME records in Route 53
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for d in aws_acm_certificate.api.domain_validation_options : d.domain_name => d
  }
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
```

### 5.3 — Attach cert to ALB HTTPS listener (replace fixed-response default action)
```hcl
resource "aws_lb_listener_certificate" "api" {
  listener_arn    = data.terraform_remote_state.network.outputs.alb_listener_arn
  certificate_arn = aws_acm_certificate_validation.api.certificate_arn
}

# Update the default action to a sensible 404 (was 503 placeholder)
# Done via aws_lb_listener resource update in network module — re-apply network layer.
```

### 5.4 — Alias record for api-dev
```hcl
resource "aws_route53_record" "api_dev" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = "api-dev.reelmart.in"
  type    = "A"
  alias {
    name                   = data.terraform_remote_state.network.outputs.alb_dns_name
    zone_id                = data.terraform_remote_state.network.outputs.alb_zone_id
    evaluate_target_health = true
  }
}
```

### 5.5 — Apply
```bash
cd infra/terraform/environments/dev
terraform plan -out=tfplan
terraform apply tfplan
```

Cert validation usually takes 1–5 min. If it hangs > 10 min, check the validation CNAME exists in Route 53 (`aws route53 list-resource-record-sets ...`).

## Deliverables
- Route 53 hosted zone (one-time)
- ACM certificate `*.reelmart.in` (status = ISSUED)
- HTTPS listener on ALB serving the cert
- A-record alias: `api-dev.reelmart.in → ALB`
- (Phase 7 will add `dev.reelmart.in` for the web app — pointed at Vercel, not ALB)

## Validation
```bash
# DNS resolves
dig api-dev.reelmart.in +short
# → some AWS-owned IP(s)

# TLS works, cert valid
curl -v https://api-dev.reelmart.in/api/catalog/health 2>&1 | grep -E "subject:|issuer:|HTTP/"
# → subject: CN=*.reelmart.in
#   issuer: CN=Amazon RSA 2048 M02
#   HTTP/2 200

# All services reachable through the public hostname
for s in catalog orders payments delivery notifications whatsapp payouts analytics returns admin; do
  printf "%-15s " "$s"
  curl -s -o /dev/null -w "%{http_code}\n" https://api-dev.reelmart.in/api/$s/health
done
# All 200
```

## Common pitfalls
- **Validation pending forever.** The validation CNAME isn't a normal CNAME — its name has weird underscores. Don't try to compose it manually; let Terraform read `domain_validation_options` and create the records.
- **NS records not updated at registrar.** ACM validation will fail because Route 53 isn't authoritative yet. Verify with `dig NS reelmart.in @8.8.8.8`.
- **Cert in `us-east-1` for ALB.** ALB certs must be in the **same region as the ALB** (ap-south-1). Only CloudFront needs us-east-1 certs — we're not using CloudFront.
- **Wildcard scope.** `*.reelmart.in` does NOT cover `reelmart.in` (the apex). The SAN above includes apex; keep it.
- **Stale ALB DNS cached.** If you destroy and recreate the ALB, its DNS name changes. Update the alias record (Terraform handles this if you re-apply).
- **Multiple `aws_route53_record` for the same name.** Will conflict. Use `for_each` over `validation_options` not `count`.

## Rollback
```bash
# Cert can't be deleted while attached to a listener. Sequence:
terraform destroy -target=aws_route53_record.api_dev
terraform destroy -target=aws_lb_listener_certificate.api
terraform destroy -target=aws_acm_certificate_validation.api
terraform destroy -target=aws_acm_certificate.api
terraform destroy -target=aws_route53_record.cert_validation
```

## Next: Phase 6
Hand off to `07_cicd_oidc.md`.
