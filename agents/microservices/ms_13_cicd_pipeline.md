# MS-13: CI/CD Pipeline
> GitHub Actions workflows — build, push to ECR, deploy to ECS Fargate. One workflow per service with path filtering so only changed services redeploy.

---

## Step 1: Repository Secrets (set in GitHub → Settings → Secrets)

```
AWS_ACCESS_KEY_ID          — IAM user with ECS/ECR deploy permissions
AWS_SECRET_ACCESS_KEY      — IAM user secret
AWS_REGION                 — ap-south-1
AWS_ACCOUNT_ID             — 123456789012
ECS_CLUSTER                — reelmart-cluster
```

---

## Step 2: Reusable Deploy Workflow

Create `.github/workflows/_deploy-service.yml` — called by each service workflow:

```yaml
name: Deploy Service (Reusable)

on:
  workflow_call:
    inputs:
      service:
        required: true
        type: string
      service_dir:
        required: true
        type: string

jobs:
  build-and-deploy:
    name: Build & Deploy ${{ inputs.service }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set image tag
        id: vars
        run: |
          echo "image=${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com/reelmart/${{ inputs.service }}:${{ github.sha }}" >> $GITHUB_OUTPUT

      - name: Build and push Docker image
        working-directory: ${{ inputs.service_dir }}
        run: |
          docker build -t ${{ steps.vars.outputs.image }} .
          docker push ${{ steps.vars.outputs.image }}
          # Also tag as latest
          docker tag ${{ steps.vars.outputs.image }} \
            ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com/reelmart/${{ inputs.service }}:latest
          docker push \
            ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com/reelmart/${{ inputs.service }}:latest

      - name: Update ECS task definition with new image
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: infra/task-definitions/${{ inputs.service }}.json
          container-name: ${{ inputs.service }}
          image: ${{ steps.vars.outputs.image }}

      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: ${{ inputs.service }}
          cluster: ${{ secrets.ECS_CLUSTER }}
          wait-for-service-stability: true
```

---

## Step 3: Per-Service Workflows (path-filtered)

Each service gets its own workflow file. Here is the pattern — create one for each of the 11 services:

### `.github/workflows/deploy-auth-service.yml`

```yaml
name: Deploy auth-service

on:
  push:
    branches: [main]
    paths:
      - 'reelmart/services/auth-service/**'
      - '.github/workflows/deploy-auth-service.yml'
      - 'infra/task-definitions/auth-service.json'

jobs:
  deploy:
    uses: ./.github/workflows/_deploy-service.yml
    with:
      service: auth-service
      service_dir: reelmart/services/auth-service
    secrets: inherit
```

### `.github/workflows/deploy-catalog-service.yml`

```yaml
name: Deploy catalog-service

on:
  push:
    branches: [main]
    paths:
      - 'reelmart/services/catalog-service/**'
      - '.github/workflows/deploy-catalog-service.yml'
      - 'infra/task-definitions/catalog-service.json'

jobs:
  deploy:
    uses: ./.github/workflows/_deploy-service.yml
    with:
      service: catalog-service
      service_dir: reelmart/services/catalog-service
    secrets: inherit
```

### `.github/workflows/deploy-order-service.yml`

```yaml
name: Deploy order-service

on:
  push:
    branches: [main]
    paths:
      - 'reelmart/services/order-service/**'
      - '.github/workflows/deploy-order-service.yml'
      - 'infra/task-definitions/order-service.json'

jobs:
  deploy:
    uses: ./.github/workflows/_deploy-service.yml
    with:
      service: order-service
      service_dir: reelmart/services/order-service
    secrets: inherit
```

### `.github/workflows/deploy-payment-service.yml`

```yaml
name: Deploy payment-service

on:
  push:
    branches: [main]
    paths:
      - 'reelmart/services/payment-service/**'
      - '.github/workflows/deploy-payment-service.yml'
      - 'infra/task-definitions/payment-service.json'

jobs:
  deploy:
    uses: ./.github/workflows/_deploy-service.yml
    with:
      service: payment-service
      service_dir: reelmart/services/payment-service
    secrets: inherit
```

### `.github/workflows/deploy-delivery-service.yml`

```yaml
name: Deploy delivery-service

on:
  push:
    branches: [main]
    paths:
      - 'reelmart/services/delivery-service/**'
      - '.github/workflows/deploy-delivery-service.yml'
      - 'infra/task-definitions/delivery-service.json'

jobs:
  deploy:
    uses: ./.github/workflows/_deploy-service.yml
    with:
      service: delivery-service
      service_dir: reelmart/services/delivery-service
    secrets: inherit
```

### `.github/workflows/deploy-notification-service.yml`

```yaml
name: Deploy notification-service

on:
  push:
    branches: [main]
    paths:
      - 'reelmart/services/notification-service/**'
      - '.github/workflows/deploy-notification-service.yml'
      - 'infra/task-definitions/notification-service.json'

jobs:
  deploy:
    uses: ./.github/workflows/_deploy-service.yml
    with:
      service: notification-service
      service_dir: reelmart/services/notification-service
    secrets: inherit
```

### `.github/workflows/deploy-whatsapp-service.yml`

```yaml
name: Deploy whatsapp-service

on:
  push:
    branches: [main]
    paths:
      - 'reelmart/services/whatsapp-service/**'
      - '.github/workflows/deploy-whatsapp-service.yml'
      - 'infra/task-definitions/whatsapp-service.json'

jobs:
  deploy:
    uses: ./.github/workflows/_deploy-service.yml
    with:
      service: whatsapp-service
      service_dir: reelmart/services/whatsapp-service
    secrets: inherit
```

### `.github/workflows/deploy-payout-service.yml`

```yaml
name: Deploy payout-service

on:
  push:
    branches: [main]
    paths:
      - 'reelmart/services/payout-service/**'
      - '.github/workflows/deploy-payout-service.yml'
      - 'infra/task-definitions/payout-service.json'

jobs:
  deploy:
    uses: ./.github/workflows/_deploy-service.yml
    with:
      service: payout-service
      service_dir: reelmart/services/payout-service
    secrets: inherit
```

### `.github/workflows/deploy-analytics-service.yml`

```yaml
name: Deploy analytics-service

on:
  push:
    branches: [main]
    paths:
      - 'reelmart/services/analytics-service/**'
      - '.github/workflows/deploy-analytics-service.yml'
      - 'infra/task-definitions/analytics-service.json'

jobs:
  deploy:
    uses: ./.github/workflows/_deploy-service.yml
    with:
      service: analytics-service
      service_dir: reelmart/services/analytics-service
    secrets: inherit
```

### `.github/workflows/deploy-return-service.yml`

```yaml
name: Deploy return-service

on:
  push:
    branches: [main]
    paths:
      - 'reelmart/services/return-service/**'
      - '.github/workflows/deploy-return-service.yml'
      - 'infra/task-definitions/return-service.json'

jobs:
  deploy:
    uses: ./.github/workflows/_deploy-service.yml
    with:
      service: return-service
      service_dir: reelmart/services/return-service
    secrets: inherit
```

### `.github/workflows/deploy-admin-service.yml`

```yaml
name: Deploy admin-service

on:
  push:
    branches: [main]
    paths:
      - 'reelmart/services/admin-service/**'
      - '.github/workflows/deploy-admin-service.yml'
      - 'infra/task-definitions/admin-service.json'

jobs:
  deploy:
    uses: ./.github/workflows/_deploy-service.yml
    with:
      service: admin-service
      service_dir: reelmart/services/admin-service
    secrets: inherit
```

---

## Step 4: IAM Policy for GitHub Actions Deploy User

Create an IAM user `reelmart-github-deploy` with this inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "arn:aws:ecr:ap-south-1:ACCOUNT_ID:repository/reelmart/*"
    },
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:RegisterTaskDefinition",
        "ecs:DescribeTaskDefinition",
        "ecs:UpdateService",
        "ecs:DescribeServices"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::ACCOUNT_ID:role/ReelMartECSExecutionRole",
        "arn:aws:iam::ACCOUNT_ID:role/ReelMartECSTaskRole"
      ]
    }
  ]
}
```

---

## Step 5: TypeScript Build Check Workflow

```yaml
# .github/workflows/typecheck.yml
name: Type Check

on:
  pull_request:
    paths:
      - 'reelmart/services/**/*.ts'
      - 'reelmart/apps/**/*.ts'
      - 'reelmart/apps/**/*.tsx'

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci --workspace=reelmart/services
      - name: Type check all services
        run: |
          for dir in reelmart/services/*/; do
            echo "Checking $dir"
            npx tsc --noEmit --project $dir/tsconfig.json
          done
```

---

## Done When

- [ ] Push to `main` touching `reelmart/services/order-service/**` triggers only `deploy-order-service` workflow
- [ ] Push touching multiple services triggers multiple independent workflows in parallel
- [ ] Each workflow: builds Docker image, pushes to ECR with git SHA tag, updates task definition, deploys to ECS
- [ ] `wait-for-service-stability: true` ensures CI fails if ECS health checks fail
- [ ] GitHub Actions secrets configured (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_ACCOUNT_ID`, `ECS_CLUSTER`)
- [ ] IAM deploy user has minimum required permissions only
- [ ] Type check workflow runs on PRs touching TypeScript files
