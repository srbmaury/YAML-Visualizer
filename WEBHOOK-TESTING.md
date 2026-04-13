# 🚀 Test GitHub Webhook Locally

## ⚡ Quick Start

```bash
# Get integration ID
node get-integration-id.js [mongodb_uri]

# Test webhook
node test-webhook.js <integration_id> [branch]

# Example
node test-webhook.js 507f1f77bcf86cd799439011 main
```

---

## ✅ Prerequisites

- Server: `http://localhost:5000`
- MongoDB running
- Integration created

---

## 🧪 Test via curl

```bash
curl -X POST "http://localhost:5000/api/github/webhook/<integration_id>" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d '{
    "ref": "refs/heads/main",
    "commits": [{
      "id": "abc123",
      "added": ["components/NewFile.jsx"]
    }]
  }'
```

---

## 📌 Expected

- **Same branch** → `{ "synced": true }`
- **Different branch** → ignored
