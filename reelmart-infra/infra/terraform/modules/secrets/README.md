# Module: secrets

Creates **empty** Secrets Manager containers. Values are populated once via `infra/scripts/populate-secrets.sh`.

Filled in during **Phase 1**.

## Secret containers (per env)
- `reelmart/<env>/supabase`    — `{ url, anon_key, service_key }`
- `reelmart/<env>/razorpay`    — `{ key_id, key_secret, webhook_secret }`
- `reelmart/<env>/gupshup`     — `{ api_key, sender_number, app_name }`
- `reelmart/<env>/twilio`      — `{ sid, token, phone_number }`
- `reelmart/<env>/shiprocket`  — `{ email, password }`
- `reelmart/<env>/firebase`    — `{ service_account_json }`
- `reelmart/<env>/jwt`         — `{ secret }`

## Inputs (planned)
- `environment` (string)

## Outputs (planned)
- `secret_arns` (map: name → ARN) — passed to IAM policy + ecs-service module
