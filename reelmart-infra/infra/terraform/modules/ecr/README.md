# Module: ecr

10 ECR repositories — one per service. Lifecycle policy keeps last 20 images per tag-prefix.

Filled in during **Phase 1**.

## Inputs (planned)
- `services` (list(string))
- `tags` (map)

## Outputs (planned)
- `repo_urls` (map: service → URI)
- `repo_arns` (map)
