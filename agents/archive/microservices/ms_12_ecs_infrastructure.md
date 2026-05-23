# MS-12: AWS ECS Infrastructure
> Provision VPC, ALB, ECS Fargate cluster, ECR repositories, Secrets Manager, and CloudWatch log groups for all 11 microservices.

---

## Architecture

```
Internet
   │
   ▼
Route 53 (reelmart.in → ALB)
   │
   ▼
ALB (HTTPS:443 → HTTP listeners)
   │ Path-based routing rules
   ├── /api/auth/*          → auth-service        ECS service
   ├── /api/stores/*        → catalog-service      ECS service
   ├── /api/products/*      → catalog-service      ECS service
   ├── /api/orders/*        → order-service        ECS service
   ├── /api/payments/*      → payment-service      ECS service
   ├── /api/delivery/*      → delivery-service     ECS service
   ├── /api/notifications/* → notification-service ECS service
   ├── /api/whatsapp/*      → whatsapp-service     ECS service
   ├── /api/payouts/*       → payout-service       ECS service
   ├── /api/analytics/*     → analytics-service    ECS service
   ├── /api/returns/*       → return-service       ECS service
   └── /api/admin/*         → admin-service        ECS service

Each ECS service:
  - Fargate 0.25 vCPU / 512 MB RAM (scale up as needed)
  - Private subnet, no public IP
  - Security group: allow 3000 from ALB SG only
  - Env vars from Secrets Manager
  - Logs to CloudWatch /reelmart/<service>
```

---

## Step 1: Variables (set these in your shell before running)

```bash
export AWS_REGION=ap-south-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_BASE=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
export CLUSTER_NAME=reelmart-cluster
export VPC_CIDR=10.0.0.0/16

SERVICES=(
  auth-service
  catalog-service
  order-service
  payment-service
  delivery-service
  notification-service
  whatsapp-service
  payout-service
  analytics-service
  return-service
  admin-service
)
```

---

## Step 2: VPC + Subnets

```bash
# Create VPC
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block $VPC_CIDR \
  --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=reelmart-vpc}]" \
  --query 'Vpc.VpcId' --output text)

aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames

# Internet Gateway
IGW_ID=$(aws ec2 create-internet-gateway \
  --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=reelmart-igw}]" \
  --query 'InternetGateway.InternetGatewayId' --output text)
aws ec2 attach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID

# Public subnets (for ALB — must span 2 AZs)
PUB_SUBNET_1=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 --availability-zone ${AWS_REGION}a \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=reelmart-pub-1a}]" \
  --query 'Subnet.SubnetId' --output text)

PUB_SUBNET_2=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID --cidr-block 10.0.2.0/24 --availability-zone ${AWS_REGION}b \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=reelmart-pub-1b}]" \
  --query 'Subnet.SubnetId' --output text)

# Private subnets (for ECS tasks)
PRIV_SUBNET_1=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID --cidr-block 10.0.10.0/24 --availability-zone ${AWS_REGION}a \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=reelmart-priv-1a}]" \
  --query 'Subnet.SubnetId' --output text)

PRIV_SUBNET_2=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID --cidr-block 10.0.11.0/24 --availability-zone ${AWS_REGION}b \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=reelmart-priv-1b}]" \
  --query 'Subnet.SubnetId' --output text)

# Public route table → IGW
PUB_RT=$(aws ec2 create-route-table --vpc-id $VPC_ID \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=reelmart-pub-rt}]" \
  --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id $PUB_RT --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID
aws ec2 associate-route-table --route-table-id $PUB_RT --subnet-id $PUB_SUBNET_1
aws ec2 associate-route-table --route-table-id $PUB_RT --subnet-id $PUB_SUBNET_2

# NAT Gateway (so private subnets can reach internet for Supabase/APIs)
EIP=$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)
NAT_GW=$(aws ec2 create-nat-gateway --subnet-id $PUB_SUBNET_1 --allocation-id $EIP \
  --tag-specifications "ResourceType=natgateway,Tags=[{Key=Name,Value=reelmart-nat}]" \
  --query 'NatGateway.NatGatewayId' --output text)
aws ec2 wait nat-gateway-available --nat-gateway-ids $NAT_GW

PRIV_RT=$(aws ec2 create-route-table --vpc-id $VPC_ID \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=reelmart-priv-rt}]" \
  --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id $PRIV_RT --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $NAT_GW
aws ec2 associate-route-table --route-table-id $PRIV_RT --subnet-id $PRIV_SUBNET_1
aws ec2 associate-route-table --route-table-id $PRIV_RT --subnet-id $PRIV_SUBNET_2
```

---

## Step 3: Security Groups

```bash
# ALB security group
ALB_SG=$(aws ec2 create-security-group \
  --group-name reelmart-alb-sg --description "ReelMart ALB" --vpc-id $VPC_ID \
  --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id $ALB_SG \
  --protocol tcp --port 443 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $ALB_SG \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

# ECS tasks security group — only accept from ALB
ECS_SG=$(aws ec2 create-security-group \
  --group-name reelmart-ecs-sg --description "ReelMart ECS Tasks" --vpc-id $VPC_ID \
  --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id $ECS_SG \
  --protocol tcp --port 3000 --source-group $ALB_SG
# Allow inter-service calls (same SG)
aws ec2 authorize-security-group-ingress --group-id $ECS_SG \
  --protocol tcp --port 3000 --source-group $ECS_SG
```

---

## Step 4: ECR Repositories

```bash
for svc in "${SERVICES[@]}"; do
  aws ecr create-repository \
    --repository-name reelmart/$svc \
    --image-scanning-configuration scanOnPush=true \
    --region $AWS_REGION
  echo "Created ECR repo: reelmart/$svc"
done
```

---

## Step 5: ECS Cluster

```bash
aws ecs create-cluster \
  --cluster-name $CLUSTER_NAME \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1 \
  --settings name=containerInsights,value=enabled \
  --tags key=Project,value=ReelMart
```

---

## Step 6: IAM Roles

```bash
# ECS Task Execution Role (pull images, write logs)
aws iam create-role \
  --role-name ReelMartECSExecutionRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }'

aws iam attach-role-policy \
  --role-name ReelMartECSExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Allow reading secrets from Secrets Manager
aws iam attach-role-policy \
  --role-name ReelMartECSExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite

# ECS Task Role (runtime permissions)
aws iam create-role \
  --role-name ReelMartECSTaskRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }'
```

---

## Step 7: Secrets Manager

```bash
# Store shared secrets (replace values before running)
aws secretsmanager create-secret \
  --name reelmart/shared \
  --secret-string '{
    "SUPABASE_URL": "https://xxxx.supabase.co",
    "SUPABASE_SERVICE_KEY": "eyJ...",
    "SUPABASE_ANON_KEY": "eyJ...",
    "INTERNAL_API_KEY": "change-me-32-char-random-secret"
  }'

aws secretsmanager create-secret \
  --name reelmart/payments \
  --secret-string '{
    "RAZORPAY_KEY_ID": "rzp_live_xxx",
    "RAZORPAY_KEY_SECRET": "xxx",
    "RAZORPAY_WEBHOOK_SECRET": "xxx"
  }'

aws secretsmanager create-secret \
  --name reelmart/notifications \
  --secret-string '{
    "FIREBASE_SERVICE_ACCOUNT_JSON": "{...}",
    "GUPSHUP_API_KEY": "xxx",
    "GUPSHUP_SENDER_NUMBER": "+91xxxxxxxxxx",
    "GUPSHUP_APP_NAME": "ReelMart"
  }'

aws secretsmanager create-secret \
  --name reelmart/delivery \
  --secret-string '{
    "SHIPROCKET_EMAIL": "xxx",
    "SHIPROCKET_PASSWORD": "xxx"
  }'
```

---

## Step 8: CloudWatch Log Groups

```bash
for svc in "${SERVICES[@]}"; do
  aws logs create-log-group --log-group-name /reelmart/$svc
  aws logs put-retention-policy --log-group-name /reelmart/$svc --retention-in-days 30
done
```

---

## Step 9: ALB + Target Groups + Listener Rules

```bash
# Create ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name reelmart-alb \
  --subnets $PUB_SUBNET_1 $PUB_SUBNET_2 \
  --security-groups $ALB_SG \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4 \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

# Default HTTPS listener (returns 404 for unmatched paths)
# Replace CERT_ARN with your ACM certificate ARN
CERT_ARN="arn:aws:acm:ap-south-1:${AWS_ACCOUNT_ID}:certificate/xxxx"

HTTPS_LISTENER=$(aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=fixed-response,FixedResponseConfig='{StatusCode=404,MessageBody=Not Found}' \
  --query 'Listeners[0].ListenerArn' --output text)

# HTTP → HTTPS redirect
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP --port 80 \
  --default-actions \
    'Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}'

# Create target group and listener rule for each service
declare -A SERVICE_PATHS
SERVICE_PATHS[auth-service]="/api/auth*"
SERVICE_PATHS[catalog-service]="/api/stores*,/api/products*,/api/reviews*"
SERVICE_PATHS[order-service]="/api/orders*"
SERVICE_PATHS[payment-service]="/api/payments*"
SERVICE_PATHS[delivery-service]="/api/delivery*"
SERVICE_PATHS[notification-service]="/api/notifications*"
SERVICE_PATHS[whatsapp-service]="/api/whatsapp*"
SERVICE_PATHS[payout-service]="/api/payouts*"
SERVICE_PATHS[analytics-service]="/api/analytics*"
SERVICE_PATHS[return-service]="/api/returns*"
SERVICE_PATHS[admin-service]="/api/admin*"

PRIORITY=10
for svc in "${SERVICES[@]}"; do
  TG_ARN=$(aws elbv2 create-target-group \
    --name reelmart-${svc}-tg \
    --protocol HTTP --port 3000 \
    --vpc-id $VPC_ID \
    --target-type ip \
    --health-check-path /health \
    --health-check-interval-seconds 30 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --query 'TargetGroups[0].TargetGroupArn' --output text)

  echo "TG_${svc}=${TG_ARN}" >> .ecs-env

  # Add listener rule
  aws elbv2 create-rule \
    --listener-arn $HTTPS_LISTENER \
    --priority $PRIORITY \
    --conditions "Field=path-pattern,Values=${SERVICE_PATHS[$svc]}" \
    --actions Type=forward,TargetGroupArn=$TG_ARN

  PRIORITY=$((PRIORITY + 10))
done
```

---

## Step 10: ECS Task Definition Template (one per service)

Save as `infra/task-definitions/<service>.json` — replace `SERVICE_NAME`, `PORT`, `SECRET_ARNS`:

```json
{
  "family": "reelmart-SERVICE_NAME",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ReelMartECSExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ReelMartECSTaskRole",
  "containerDefinitions": [
    {
      "name": "SERVICE_NAME",
      "image": "ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/reelmart/SERVICE_NAME:latest",
      "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
      "essential": true,
      "environment": [
        { "name": "PORT", "value": "3000" },
        { "name": "NODE_ENV", "value": "production" }
      ],
      "secrets": [
        { "name": "SUPABASE_URL",         "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:reelmart/shared:SUPABASE_URL::" },
        { "name": "SUPABASE_SERVICE_KEY", "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:reelmart/shared:SUPABASE_SERVICE_KEY::" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/reelmart/SERVICE_NAME",
          "awslogs-region": "ap-south-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

---

## Step 11: Register Task Definitions + Create ECS Services

```bash
source .ecs-env  # Load TG ARNs saved in Step 9

for svc in "${SERVICES[@]}"; do
  # Register task definition from file
  aws ecs register-task-definition \
    --cli-input-json file://infra/task-definitions/${svc}.json

  TG_VAR="TG_${svc}"
  TG_ARN="${!TG_VAR}"

  # Create ECS service
  aws ecs create-service \
    --cluster $CLUSTER_NAME \
    --service-name $svc \
    --task-definition reelmart-${svc} \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUBNET_1,$PRIV_SUBNET_2],securityGroups=[$ECS_SG],assignPublicIp=DISABLED}" \
    --load-balancers "targetGroupArn=${TG_ARN},containerName=${svc},containerPort=3000" \
    --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100" \
    --tags key=Project,value=ReelMart
done
```

---

## Step 12: Inter-Service DNS (ECS Service Discovery)

Instead of hardcoding IPs, use AWS Cloud Map for service discovery:

```bash
# Create namespace
NS_ID=$(aws servicediscovery create-private-dns-namespace \
  --name reelmart.local \
  --vpc $VPC_ID \
  --query 'OperationId' --output text)

# Wait for namespace creation, then get ID
NS_ARN=$(aws servicediscovery list-namespaces \
  --query "Namespaces[?Name=='reelmart.local'].Arn" --output text)

# Register each service (add --service-discovery to ECS create-service above)
for svc in "${SERVICES[@]}"; do
  SD_SVC=$(aws servicediscovery create-service \
    --name $svc \
    --dns-config "NamespaceId=${NS_ARN},DnsRecords=[{Type=A,TTL=60}]" \
    --health-check-custom-config FailureThreshold=1 \
    --query 'Service.Arn' --output text)
  echo "SD_${svc}=${SD_SVC}" >> .ecs-env
done
```

After this, services can reach each other at:  
`http://notification-service.reelmart.local:3000/api/notifications/...`  
`http://payment-service.reelmart.local:3000/api/payments/...`

Set these as env vars in each service's task definition instead of the Docker Compose hostnames.

---

## Done When

- [ ] VPC created with public + private subnets across 2 AZs
- [ ] NAT Gateway allowing private subnets internet access
- [ ] ALB with HTTPS listener + HTTP→HTTPS redirect
- [ ] 11 ECR repositories created
- [ ] ECS Fargate cluster with container insights enabled
- [ ] IAM roles for task execution and task runtime
- [ ] Secrets stored in Secrets Manager (not hardcoded)
- [ ] CloudWatch log groups with 30-day retention
- [ ] Target groups and path-based routing rules for all 11 services
- [ ] ECS services deployed and passing health checks (`/health` returns 200)
- [ ] Inter-service communication works via Cloud Map DNS
